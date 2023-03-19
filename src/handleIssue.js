// On a new issue we want to add the first comment so we can keep track of events
console.log('Make sure the issue is an adr')
if (!context.payload.issue.labels.find(({ name }) => name === 'adr')) return

const tplLog = `
<details><summary>ℹ️ ADR Status: draft</summary>

\`\`\`
deciders:
approvals:
rejections:
status: draft
\`\`\`

</details>

---

_This comment is used to keep track of the events related to this ADR_
`

console.log('Create the first comment', tplLog)
github.rest.issues.createComment({
  owner: context.repo.owner,
  repo: context.repo.repo,
  issue_number: context.issue.number,
  body: tplLog
})