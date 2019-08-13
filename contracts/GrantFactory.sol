pragma solidity >=0.5.10 <0.6.0;
pragma experimental ABIEncoderV2;

/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
contract GrantFactory {

    /*----------  Globals  ----------*/

    mapping(uint256 => Grant) internal _grants;  // Grants mapped by GUID.


    /*----------  Types  ----------*/

    struct Grant {
        address
    }


events LogNewGrant

    /*----------  Methods  ----------*/

    /**
     * @dev Grant creation function. May be called by grantors, grantees, or any other relevant party.
     * @param grantees Recipients of unlocked funds and their respective allocations.
     * @param grantManagers (Optional) Weighted managers of distribution of funds.
     * @param currency (Optional) If null, amount is in wei, otherwise address of ERC20-compliant contract.
     * @param targetFunding (Optional) Funding threshold required to release funds.
     * @param fundingExpiration (Optional) Block number after which votes OR funds (dependant on GrantType) cannot be sent.
     * @param contractExpiration (Optional) Block number after which payouts must be complete or anyone can trigger refunds.
     * @param grantType Which grant success scheme to apply to this grant.
     * @param extraData Support for extensions to the Standard.
     * @return GUID for this grant.
     */
    function create(
        Grantee[] memory grantees,
        address grantManager,
        address currency,
        uint256 targetFunding,
        uint256 fundingExpiration,
        uint256 contractExpiration,
        bytes memory extraData // implementation detail
    )
        public
        returns (bytes32 id);

    /**
     * @dev Cancel grant and enable refunds.
     * @param id GUID for the grant to refund.
     * @return True if successful, otherwise false.
     */
    function cancelGrant(bytes32 id)
        public
        returns (uint256 balance);
}
