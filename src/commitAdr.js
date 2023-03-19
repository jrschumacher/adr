onst crypto = require('crypto')
          const fs = require('fs')

          const adrDir = './adrs'
          const stateAccepted = 'adr:accepted'
          const adrId = ulid()
          const issueNumber = context.issue.number

          // These values should NEVER change. If
          // they do, we're no longer making ulids!
          function ulid(seedTime) {
              const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford's Base32
              const ENCODING_LEN = ENCODING.length;
              const TIME_MAX = Math.pow(2, 48) - 1;
              const TIME_LEN = 10;
              const RANDOM_LEN = 16;
              function randomChar(prng) {
                  let rand = Math.floor(prng() * ENCODING_LEN);
                  if (rand === ENCODING_LEN) {
                      rand = ENCODING_LEN - 1;
                  }
                  return ENCODING.charAt(rand);
              }
              function encodeTime(now, len) {
                  if (isNaN(now)) {
                      throw new Error(now + " must be a number");
                  }
                  if (now > TIME_MAX) {
                      throw new Error("cannot encode time greater than " + TIME_MAX);
                  }
                  if (now < 0) {
                      throw new Error("time must be positive");
                  }
                  if (Number.isInteger(now) === false) {
                      throw new Error("time must be an integer");
                  }
                  let mod = void 0;
                  let str = "";
                  for (; len > 0; len--) {
                      mod = now % ENCODING_LEN;
                      str = ENCODING.charAt(mod) + str;
                      now = (now - mod) / ENCODING_LEN;
                  }
                  return str;
              }
              function encodeRandom(len, prng) {
                  let str = "";
                  for (; len > 0; len--) {
                      str = randomChar(prng) + str;
                  }
                  return str;
              }

              return encodeTime(isNaN(seedTime) ? Date.now() : seedTime, TIME_LEN)
                  + encodeRandom(RANDOM_LEN, () => crypto.randomBytes(1).readUInt8() / 0xff);
          }

          // Get issue
          const res = await github.rest.issues.get({
              repo: context.repo.repo,
              owner: context.repo.owner,
              issue_number: issueNumber
          })
          
          const issue = res.data

          // Ensure issue was accepted and closed
          if (!issue.labels.find(l => l.name === stateAccepted)) {
              throw new Error(`Issue ${issueNumber} did not have label ${stateAccepted}`)
          }

          // Ensure issue was closed
          if (!issue.state === 'closed') {
              throw new Error(`Issue ${issueNumber} was not closed`)
          }

          const cleanTitle = issue.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()

          fs.writeFileSync(`${adrDir}/${adrId}-${cleanTitle}.md`, issue.body)

          // Get issue actor
          const actorRes = await github.rest.users.getByUsername({
              username: issue.user.login
          })

          if (actorRes.data) {
              const actor = actorRes.data
              core.exportVariable('authorName', actor.name)
              core.exportVariable('authorEmail', `${actor.id}+${actor.login}@users.noreply.github.com`)
          }