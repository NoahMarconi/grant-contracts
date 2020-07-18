// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./GranteeTypes.sol";

contract GranteeConstructor is GranteeTypes {
    using SafeMath for uint256;

    /*----------  Constructor  ----------*/

    /**
     * @dev Grant creation function. May be called by donors, grantees, or any other relevant party.
     * @param _grantees Sorted recipients of donated funds.
     * @param _amounts Respective allocations for each Grantee (must follow sort order of _grantees).
     */
    constructor(
        address[] memory _grantees,
        uint256[] memory _amounts
    )
        public
    {

        require(
            _grantees.length > 0,
            "constructor::Invalid Argument. Must have one or more grantees."
        );

        require(
            _grantees.length == _amounts.length,
            "constructor::Invalid Argument. _grantees.length must equal _amounts.length"
        );


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

}