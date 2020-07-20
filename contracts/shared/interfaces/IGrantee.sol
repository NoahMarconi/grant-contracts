// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi
 */
interface IGrantee {

    /*----------  Types  ----------*/

    struct Grantee {
        uint256 targetFunding;   // Funding amount targeted for Grantee.
        uint256 totalPaid;       // Cumulative funding received by Grantee.
        uint256 payoutApproved;  // Pending payout approved by Manager.
    }


    /*----------  Shared Getters  ----------*/

    /**
     * @dev  Grantee amounts are percentage based (if true) or fixed (if false).
     */
    function getPercentageBased()
        external
        view
        returns(bool);

    /**
     * @dev  Overall funding target for all grantees combined.
     */
    function getCumulativeTargetFunding()
        external
        view
        returns(uint256);

    /**
     * @dev Get grantee target funding by address.
     * @param grantee address of grantee to get.
     */
    function getTargetFunding(address grantee)
        external
        view
        returns(uint256);

    /**
     * @dev Get grantee total paid by address.
     * @param grantee address of grantee to get.
     */
    function getTotalPaid(address grantee)
        external
        view
        returns(uint256);

    /**
     * @dev Get grantee payout approved by address.
     * @param grantee address of grantee to get.
     */
    function getPayoutApproved(address grantee)
        external
        view
        returns(uint256);

    /*----------  Shared Setters  ----------*/

    /**
     * @dev Set grantee target funding by address.
     * @param grantee address of grantee to get.
     */
    function setTargetFunding(address grantee, uint256 value)
        external;


    /**
     * @dev  Overall funding target for all grantees combined.
     */
    function setCumulativeTargetFunding(uint256 value)
        external;


    /*----------  Public Methods  ----------*/

    /**
     * @dev Grantee specific check for remaining allocated funds.
     * @param grantee's address.
     */
    function remainingAllocation(address grantee)
        external
        view
        returns(uint256);


}
