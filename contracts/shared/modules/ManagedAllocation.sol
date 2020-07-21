// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../interfaces/IManager.sol";
import "../interfaces/IGrantee.sol";


/**
 * @title Managed Allocation Abstract Contract.
 * @dev Handles reduction of grantee allocations.
 * @author @NoahMarconi
 */
abstract contract ManagedAllocation is IManager, IGrantee {
    using SafeMath for uint256;

    /*----------  Events  ----------*/

    /**
     * @dev Manager reducing allocation.
     * @param grantee Address with reduced allocation.
     * @param value Amount in WEI or ATOMIC_UNITS approved for payment.
     */
    event LogAllocationReduction(address indexed grantee, uint256 value);


    /*----------  Public Methods  ----------*/


    /**
     * @dev Reduce a grantee's allocation by a specified value.
     * @param value Amount to reduce by.
     * @param grantee Grantee address to reduce allocation from.
     */
    function reduceAllocation(uint256 value, address grantee)
        public
    {
        this.requireManager();

        require(
            this.getTargetFunding(grantee) >= value,
            "reduceAllocation::Invalid Argument. value exceeds grantee targetFunding."
        );

        this.setTargetFunding(
            grantee,
            this.getTargetFunding(grantee).sub(value)
        );


        if (this.getPercentageBased()) {
            this.setCumulativeTargetFunding(
                this.getCumulativeTargetFunding().sub(value)
            );
        }


        emit LogAllocationReduction(grantee, value);

    }


}