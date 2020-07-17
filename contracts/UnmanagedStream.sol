// SPDX-License-Identifier: MIT

pragma solidity >=0.6.8 <0.7.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/utils/ReentrancyGuard.sol";
import "./Percentages.sol";

/**
 * @title Grant for Eth2.
 * @dev Managed                     (n)
 *      Funding Deadline            (n)
 *      Contract expiry             (n)
 *      With Token                  (n)
 *      Percentage based allocation (y)
 *      Withdraw (pull payment)     (n)
 *      This is a simplified grant which behaves as a simple payment splitter.
 *      No refunds, managers, and payment are immediately pushed.
 * @author @NoahMarconi
 */
contract UnmanagedStream is ReentrancyGuard {
    using SafeMath for uint256;


    /*----------  Global Variables  ----------*/

    /* solhint-disable max-line-length */
    address[] private granteeReference;          // Reference to grantee addresses to allow for allocation top up.
    uint256 private cumulativeTargetFunding;     // Denominator for calculating grantee's percentage.
    bytes public uri;                            // URI for additional (off-chain) grant details such as description, milestones, etc.
    uint256 public totalFunding = 0;             // Cumulative funding donated by donors.
    mapping(address => Grantee) public grantees; // Grant recipients by address.
    /* solhint-enable max-line-length */


    /*----------  Types  ----------*/

    struct Grantee {
        uint256 targetFunding;   // Funding amount targeted for Grantee.
    }


    /*----------  Events  ----------*/

    /**
     * @dev Grant cancellation event.
     */
    event LogGrantCancellation();

    /**
     * @dev Grant received funding.
     * @param donor Address funding the grant.
     * @param value Amount in WEI.
     */
    event LogFunding(address indexed donor, uint256 value);


    /*----------  Constructor  ----------*/

    /**
     * @dev Grant creation function. May be called by grantors, grantees, or any other relevant party.
     * @param _grantees Sorted recipients of unlocked funds.
     * @param _amounts Respective allocations for each Grantee (must follow sort order of _grantees).
     * @param _currency (Optional) If null, amount is in wei, otherwise address of ERC20-compliant contract.
     * @param _uri URI for additional (off-chain) grant details such as description, milestones, etc.
     * @param _extraData (Optional) Support for extensions to the Standard.
     */
    constructor(
        address[] memory _grantees,
        uint256[] memory _amounts,
        address _currency,
        bytes memory _uri,
        bytes memory _extraData
    )
        public
    {

        require(
            _currency == address(0),
            "constructor::Invalid Argument. Currency must be ADDRESS_ZERO."
        );

        require(
            _grantees.length > 0,
            "constructor::Invalid Argument. Must have one or more grantees."
        );

        require(
            _grantees.length == _amounts.length,
            "constructor::Invalid Argument. _grantees.length must equal _amounts.length"
        );

        // Initialize globals.
        uri = _uri;

        // Initialize Grantees.
        address lastAddress = address(0);
        for (uint256 i = 0; i < _grantees.length; i++) {
            address currentGrantee = _grantees[i];
            uint256 currentAmount = _amounts[i];

            require(
                currentAmount > 0,
                "constructor::Invalid Argument. currentAmount must be greater than 0."
            );

            require(
                currentGrantee > lastAddress,
                "constructor::Invalid Argument. Duplicate or out of order _grantees."
            );

            require(
                currentGrantee != address(0),
                "constructor::Invalid Argument. grantee address cannot be a ADDRESS_ZERO."
            );

            lastAddress = currentGrantee;
            grantees[currentGrantee].targetFunding = currentAmount;

            cumulativeTargetFunding = cumulativeTargetFunding.add(currentAmount);

            // Store address as reference.
            granteeReference.push(currentGrantee);
        }

    }


    /*----------  Fallback  ----------*/

    receive()
        external
        payable
        nonReentrant
    {

        require(
            grantees[msg.sender].targetFunding == 0,
            "fund::Permission Error. Grantee cannot fund."
        );

        // Defer to correct funding method.
        require(
            msg.value > 0,
            "fallback::Invalid Value. msg.value must be greater than 0."
        );

        for (uint256 i = 0; i < granteeReference.length; i++) {
            address payable currentGrantee = payable(granteeReference[i]);

            uint256 eligiblePortion = Percentages.maxAllocation(
                grantees[currentGrantee].targetFunding,
                cumulativeTargetFunding,
                msg.value
            );

            require(
                currentGrantee.send(eligiblePortion), // solhint-disable-line check-send-result
                "fallback::Transfer Error. Unable to send eligiblePortion to Grantee."
            );

        }

        totalFunding = totalFunding.add(msg.value);

        emit LogFunding(msg.sender, msg.value);

    }

}
