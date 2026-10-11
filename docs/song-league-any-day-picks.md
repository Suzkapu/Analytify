# Weekly Song League picks

Members may submit one discovery during each league-local Friday-to-Friday week.
The database serializes submissions for each league and retains the unique
round/member constraint, including simultaneous submissions from two devices.
Discovery validation and the frozen round baseline remain unchanged.

A pick starts scoring the following local day. Its scoring end remains the
Friday cohort's existing end (Saturday midnight after four scoring weeks).
The weekly playlist removes that cohort at its existing Friday rollover.
Late picks therefore receive less scoring time, not a new four-week lifetime.
A Thursday pick does not consume the new Friday allowance.

Every accepted pick increments the league playlist revision and makes every
active member's existing playlist sync task due. The page also requests an
immediate league-wide refresh. Feature-required playlist retries may run any day;
optional administrator-only scheduling retains its existing Friday setting.
Spotify ownership checks, leases, revision checks and written-approval policy
remain in force. No unrelated Spotify playlists are changed or deleted.

Figma interaction contract:
https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd/Analytify?node-id=996-32242
This isolated main-only note leaves the active Design v2 screens untouched.

Rollback requires restoring the previous function bodies and Friday page gate
from main's previous release, while leaving accepted picks and scores intact.
Do not reinstate the old round equality constraint until any expanded round
submission windows have been reconciled. Do not delete recommendations to roll back.
