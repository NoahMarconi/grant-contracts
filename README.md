# grant-contracts

# ------------------ waffle commands

# compile and build contracts
./node_modules/ethereum-waffle/bin/waffle waffle.js

# run test cases
1  ./node_modules/ts-mocha/bin/ts-mocha test/<particular-test-case>
2  ./node_modules/ts-mocha/bin/ts-mocha test/*


# truffle commands
Compile:        truffle compile
Migrate:        truffle migrate
                  or
                truffle migrate -network development
                or
                truffle migrate --reset
		or
                truffle migrate --reset --all

truffle create migration 1_hello_world


to start truffle(development)
truffle develop 
 

to test contracts
truffle test

https://www.chaijs.com/api/assert/#method_equal
https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
https://www.chaijs.com/api/bdd/#method_ok

Question. In Grant contructor, grantee means who will do the work in exchange of money.
   Why grantee should be sending the money? Its donor that should be sending the money.

   For Debugging
   https://medium.com/linum-labs/error-vm-exception-while-processing-transaction-revert-8cd856633793


https://ethereum-waffle.readthedocs.io/en/latest/matchers.html#revert
https://web3js.readthedocs.io/en/v1.2.0/web3-eth-contract.html
https://docs.ethers.io/ethers.js/html/api-contract.html#meta-class-properties
https://medium.com/linum-labs/error-vm-exception-while-processing-transaction-revert-8cd856633793

# for new Contract

const grantFromDonorWithEther: Contract = new Contract(grantWithEther.address, Grant.abi, donorWallet);

here gas fees are paid by the donorWallet
AND in the contract msg.sender is the donor wallet address


const grantFromManagerWithEther: Contract = new Contract(grantWithEther.address, Grant.abi, managerWallet);

here gas fees are paid by the managerWallet address
AND in the contract msg.sender is the manager wallet address

new Contract is just to initialize an interface to access an already deployed contract
new Contract allows you to change who sends gas fee for transactions using the interface you create