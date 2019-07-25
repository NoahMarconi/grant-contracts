Questions:
- can we get rid of grant types?
- can we reduce the # of grant status?
- can we reduce # of roles (grantor / grantee)
- can we combine / reduce grant state
- do we want to store grant recipients as array or mapping
  - do we need to iterate over this in the contract logic
- can we remove "request payment"
  - are we assuming that grant managers have robust offchain comm with grantees
  - what if everyone is a grant manager?
- can we remove Payments[] by having a "requesting" global state
  - grant managers approve / vote on the requested funds
  - if expires then can propose again
  - possibly use timestamp to avoid explicit states
- can we remove multiple grant managers / voting / m-of-n and replace w/ msig?

Refunds:
- Two refund operations:
  1. The grant does not reach the funding goal in time.
   - any donor can withdraw
   - bonus for auto-withdraw
  2. The grant managers decides to refund the donors.
  3. The grant reaches the funding goal, but funds are still remaining after
     a second expiration date
   - kill expiration on the grant contract which freezes all future payouts

Stretch Goal:
- can we outsource grantees / grant manager to a separate contract?
  - if we have one that makes sense as a sane default
  - what are all the interfaces between grantees / managers / grants?

TODO:
- partial refunds by tracking donations
- auto refund if expiration and target not reached
- use counter for ID
- signal should be a function (yes or no)

Notes:
- spawn new contract for each grant
- send ETH directly to grant

Bonus:
- prevent duplicate addresses
https://github.com/christianlundkvist/simple-multisig/blob/720386bc141b8f5e5d4dc57519e4e6c3e43b4911/contracts/SimpleMultiSig.sol#L27


FUND_THRESHOLD, // Funds unlocked if threshold met.
- time based expiration
FUNDER_VOTE,    // Funds unlocked if funders approve.
- funders become grant managers
- get votes based on donations
MANAGED,        // Funds unlocked by grant_managers.
- pre-selected grant managers
OPAQUE          // Other offchain method.
- ?





grantee uniqueness check


? extension to send simple ETH to fallback.
   ^
   |
   |
factory



Reject eth if currency is token.
Fallback function for simple eth transfer

Return the rest if over funded.
Fixed sized grants you pre-populate on create
If dynamic sized grant you calculate.



Consistent return value (funds or success/fail)?

Sweep (accidental transfers)?

Grant Types (capped, etc.)

Same address, fund multiple times (currently yes)

Who can cancel?

Weight out of (uint8 255 or easy to calc 100)?

Allocation as percent?

GrantManager threshold constraints (any m of n, validate on create, etc)?

Delete payment request.

TODO: Grantee cannot be GrantManager.

# Status Transitions.
GrantStatus transition conditions?
(implement in reference implementation but do not enforce in standard)

INIT --create--> SIGNAL --endSignaling--> FUND --?--> PAY

{ FUND, PAY } --initRefund--> REFUND

{ SIGNAL, FUND, PAY } --?--> COMPLETE



fund (defer to GrantType)
cancel
