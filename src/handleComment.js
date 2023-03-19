const labelPrefix = 'adr';
const stateDraft = 'draft';
const statePendingApproval = 'pending-approval';
const stateAccepted = 'accepted';
const stateRejected = 'rejected';
const stateDeprecated = 'deprecated';
const stateSuperseded = 'superseded';

const cmdPrefix = 'adr';
const cmdRequestApproval = 'request-approval';
const cmdAddDecider = 'add-decider';
const cmdRemoveDecider = 'remove-decider';
const cmdAccept = 'accept';
const cmdReject = 'reject';

const validUsername = '@[a-zd](?:[a-zd]|-(?=[a-zd])){0,38}';

const commentBody = context.payload.comment.body;
const commentActor = context.payload.comment.user.login;

const eqSet = (a, b) => a.size === b.size && [...a].every((i) => b.has(i));

const fmtMessage = (...msg) =>
  msg.map((l) => (typeof l == 'string' && l) || '').join('\n');

const ghComment = (...msg) =>
  github.rest.issues.createComment({
    repo: context.repo.repo,
    owner: context.repo.owner,
    issue_number: context.issue.number,
    body: fmtMessage(...msg),
  });

const ghUpdateComment = (comment_id, ...msg) =>
  github.rest.issues.updateComment({
    repo: context.repo.repo,
    owner: context.repo.owner,
    issue_number: context.issue.number,
    comment_id,
    body: fmtMessage(...msg),
  });

const errComment = (summary, ...detail) =>
  ghComment(
    `<details><summary>❗ @${commentActor} ${summary}</summary>`,
    '',
    '---',
    '',
    ...detail,
    `</details>`
  );

async function updateState(commentId, status, deciders, approvals, rejections) {
  console.log(
    `Updating state for ${commentId}`,
    status,
    deciders,
    approvals,
    rejections
  );

  // Get existing labels
  let existingLabels = await github.rest.issues.listLabelsOnIssue({
    repo: context.repo.repo,
    owner: context.repo.owner,
    issue_number: context.issue.number,
  });

  // Filter out status labels
  let nextLabels = existingLabels.data
    .map((l) => l.name)
    .filter((l) => !l.startsWith(`${cmdPrefix}:`));
  // Add new status label
  nextLabels.push(`${labelPrefix}:${status}`);

  // Update status comment
  ghUpdateComment(
    commentId,
    `<details><summary>ℹ️ ADR Status: ${status}</summary>`,
    '',
    '```',
    `deciders: ${[...deciders].join(' ')}`,
    `approvals: ${[...approvals].join(' ')}`,
    `rejections: ${[...rejections].join(' ')}`,
    `status: ${status}`,
    '```',
    '',
    `</details>`
  );

  // TODO: Create commit

  let issueState = 'open';
  let issueStateReason = null;
  if (status === stateAccepted) {
    issueState = 'closed';
    issueStateReason = 'completed';
  } else if (status === stateRejected) {
    issueState = 'closed';
    issueStateReason = 'not_planned';
  }

  // Update status and close if needed
  github.rest.issues.update({
    repo: context.repo.repo,
    owner: context.repo.owner,
    issue_number: context.issue.number,
    labels: nextLabels,
    state: issueState,
    state_reason: issueStateReason,
  });
}

async function getState() {
  let comment = null;
  let state = {
    deciders: [],
    approvals: [],
    rejections: [],
    status: '',
  };

  console.log('Finding status comment');
  // TODO: Support pagination of the GH comments
  const comments = await github.rest.issues.listComments({
    repo: context.repo.repo,
    owner: context.repo.owner,
    issue_number: context.issue.number,
    per_page: 100, // max
  });
  if (!comments || !Array.isArray(comments.data)) {
    console.error('Could not get issue comments', comments);
    throw new Error('Could not get issue comments');
  }

  comment = comments.data.find((c) =>
    c.body.startsWith('<details><summary>ℹ️ ADR Status')
  );
  if (!comment) {
    console.error('Could not find state comment');
    throw new Error('Could not find state comment');
  }

  console.log('Found state comment', comment.id);
  state = comment.body
    .split('```')[1]
    .trim()
    .split('\n')
    .reduce((prev, cur) => {
      const [key, val] = cur.split(':').map((s) => s.trim());
      return { ...prev, [key.toLowerCase()]: val };
    }, state);

  console.log('Extracted state', state);
  return {
    commentId: comment.id,
    deciders: state?.deciders?.split(' ').filter((i) => i !== ''),
    approvals: state?.approvals?.split(' ').filter((i) => i !== ''),
    rejections: state?.rejections?.split(' ').filter((i) => i !== ''),
    status: state?.status,
  };
}

async function updateStatus(status, params) {
  console.log('Updating state comment', status, params);
  const actor = `@${params.actor}`;
  let state = {};
  try {
    state = await getState();
  } catch (e) {
    console.error('Error getting state', e);
    return;
  }

  const deciders = new Set(state.deciders);
  const approvals = new Set(state.approvals);
  const rejections = new Set(state.rejections);

  switch (status) {
    case cmdAddDecider:
    case cmdRequestApproval:
      if (cmdRequestApproval) {
        deciders.clear();
        approvals.clear();
        rejections.clear();
      }
      params.deciders.forEach((decider) => deciders.add(decider));
      break;
    case cmdRemoveDecider:
      params.deciders.forEach((decider) => deciders.delete(decider));
      break;
    case stateAccepted:
      if (deciders.has(actor)) {
        approvals.add(actor);
        rejections.delete(actor);
      }
      break;
    case stateRejected:
      if (deciders.has(actor)) {
        rejections.add(actor);
        approvals.delete(actor);
      }
      break;
  }

  // Calculate status
  nextStatus = statePendingApproval;
  if (deciders.size === 0) {
    nextStatus = stateDraft;
  } else if (rejections.size === 0 && eqSet(deciders, approvals)) {
    nextStatus = stateAccepted;
  } else if (approvals.size === 0 && eqSet(deciders, rejections)) {
    nextStatus = stateRejected;
  }

  await updateState(
    state.commentId,
    nextStatus,
    deciders,
    approvals,
    rejections
  );

  // Indicate we want to do something
  if (nextStatus === stateAccepted) {
    core.exportVariable('commitADR', true);
  }
}

////////// MAIN

console.log('Processing command', commentBody);
// adr cmd [params]
const reCmd = new RegExp(`^${cmdPrefix} ([^ ]+)((?: [^ ]+)*)?`);
const cmdComment = commentBody?.trim().match(reCmd);
// Bail if comment is empty
if (!cmdComment) return errComment('No command found');
let [_, cmd, params] = cmdComment;
params = params?.trim().split(' ') || [];

// Handle closed issues
if (context.payload.issue.state === 'closed') {
  return errComment(
    'This ADR is closed, any further changes will need to be made via commits.'
  );
}

console.log(`Processing command from ${commentActor}`, cmd, params);
switch (cmd) {
  case cmdAddDecider:
  case cmdRemoveDecider:
  case cmdRequestApproval:
    console.log('Requesting approval');
    if (params.length === 0)
      return errComment(
        'Please specify at least one user to request approval from.',
        `Example: \`${cmdPrefix} ${cmdRequestApproval} @user1 @user2\``
      );

    const invalid = params.filter((p) => !p.match(validUsername));
    if (invalid.length > 0)
      return errComment(
        `Invalid username(s) in request: ${invalid.join(' ')}`,
        'Valid usernames must start with `@` and contain only alphanumeric characters or hyphens, and cannot end with a hyphen.'
      );

    updateStatus(cmd, { deciders: params, approvals: [], rejections: [] });

    ghComment(
      fmtMessage(
        `${params.join(' ')} Please review this ADR.`,
        '',
        '---',
        '',
        `- 👍 To **${cmdAccept}** this ADR, comment:`,
        `  - \`${cmdPrefix} ${cmdAccept}\``,
        `- 👎 To **${cmdReject}** this ADR, comment:`,
        `  - \`${cmdPrefix} ${cmdReject}\``
      )
    );
    break;
  case cmdAccept:
    console.log('Approving');
    updateStatus(stateAccepted, { actor: commentActor });
    break;
  case cmdReject:
    console.log('Rejecting');
    updateStatus(stateRejected, { actor: commentActor });
    break;
  default:
    console.log('Unknown command');
    errComment(
      `Unknown command \`${cmd}\`.`,
      `Unknown command: \`${commentBody}\``,
      '',
      '---',
      '',
      'Author actions:',
      `- Request approval (reset state) \`${cmdPrefix} ${cmdRequestApproval} @user1 @user2\``,
      `- Add decider(s) \`${cmdPrefix} ${cmdAddDecider}\``,
      `- Remove decider(s) \`${cmdPrefix} ${cmdRemoveDecider}\``,
      '',
      'Decider actions:',
      `- Accept the ADR \`${cmdPrefix} ${cmdAccept}\``,
      `- Reject the ADR \`${cmdPrefix} ${cmdReject}\``
    );
    break;
}
