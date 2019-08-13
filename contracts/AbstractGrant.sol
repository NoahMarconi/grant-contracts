pragma solidity >=0.5.10 <0.6.0;
pragma experimental ABIEncoderV2;

/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
contract AbstractGrant {

    /*----------  Globals  ----------*/

    address manager;                      // Multisig or EOA address to manage grant.
    uint256 totalDonors;                  // Cumulative number of Donors for this grant.
    address currency;                     // (Optional) If null, amount is in wei, otherwise address of ERC20-compliant contract.
    uint256 targetFunding;                // (Optional) Funding threshold required to release funds.
    uint256 totalFunding;                 // Cumulative funding donated by donors.
    uint256 totalPayed;                   // Cumulative funding payed to grantees.
    uint256 totalRefunded;                // Cumulative funding refunded to grantors.
    uint256 fundingExpiration;            // (Optional) Block number after which votes OR funds (dependant on GrantType) cannot be sent.
    uint256 contractExpiration;           // (Optional) Block number after which payouts must be complete or anyone can trigger refunds.
    GrantStatus grantStatus;              // Current GrantStatus.
    mapping(address => Grantee) grantees; // Grant recipients by address.
    mapping(address => Donor) donors;     // Donors by address.

    /*----------  Types  ----------*/


    // TODO: Confirm GrantStatus not needed for FUNDRAISING as it can be inferred.

    // 1. INIT is fine - contract deployment
    // 2. remove SIGNAL
    // 3. FUNDRAISING is fine - fund start timestamp passed
    // 4. working
    // 5. done (all refunds allowed)

    // INIT -> FUNDRAISING -> SUCCESS -> DONE
    //                     -> DONE

    enum GrantStatus {
        INIT,    // Contract Deployment.
        SUCCESS, // Grant successfully funded.
        DONE     // Grant complete and funds dispersed.
    }

    struct Grantee {
        uint256 targetFunding; // Funding amount targeted for Grantee.
        uint256 totalPayed;    // Cumulative funding received by Grantee.
    }

    struct Donor {
        uint256 funded;   // Total amount funded.
        uint256 refunded; // Cumulative amount refunded.
    }


    /*----------  Events  ----------*/

    /**
     * @dev Change in GrantStatus.
     * @param grantStatus New GrantStatus.
     */
    event LogStatusChange(GrantStatus grantStatus);

    /**
     * @dev Grant received funding.
     * @param donor Address funding the grant.
     * @param value Amount in WEI or GRAINS funded.
     */
    event LogFunding(address indexed donor, uint256 value);

    /**
     * @dev Grant refunding funding.
     * @param donor Address receiving refund.
     * @param value Amount in WEI or GRAINS refunded.
     */
    event LogRefund(address indexed donor, uint256 value);

    /**
     * @dev Grant paying grantee.
     * @param grantee Address receiving payment.
     * @param value Amount in WEI or GRAINS refunded.
     */
    event LogPayment(address indexed grantee, uint256 value);

    /**
     * @dev Grantee requesting a payment.
     * @param grantee Address receiving payment.
     * @param value Amount in WEI or GRAINS refunded.
     */
    event LogPaymentRequest(address indexed grantee, uint256 value);


    /*----------  Methods  ----------*/

    constructor(
        address _grantee,
        address _manager,
        address _currency,
        uint256 _targetFunding,
        uint256 _fundingExpiration,
        uint256 _contractExpiration
    )
        public;

    /**
     * @dev Total funding getter.
     * @param value Amount in WEI or GRAINS to fund.
     * @return Cumulative funding received for this grant.
     */
    function getTotalFunding()
        public
        view
        returns (uint256 funding);

    /**
     * @dev Fund a grant proposal.
     * @param value Amount in WEI or GRAINS to fund.
     * @return Remaining funding available in this grant.
     */
    function fund(uint256 value)
        public
        payable
        returns (uint256 balance);

    /**
     * @dev Pay a grantee.
     * @param grantee Recipient of payment.
     * @param value Amount in WEI or GRAINS to fund.
     * @return Remaining funding available in this grant.
     */
    function payout(address grantee, uint256 value)
        public
        returns (uint256 balance);

    /**
     * @dev Refund a grantor.
     * @param donor Recipient of refund.
     * @return Remaining funding available in this grant.
     */

    // TODO: MUST BE DONE
    // any donor can receive up to their maximum
    // - their fraction of (total funding - total spent) * (donor value / total funding)
    // - only allow refunds in full
    // - check that donor refund = 0
    function refund(address donor)
        public
        returns (uint256 balance);

    /**
     * @dev Cancel grant and enable refunds.
     * @return Remaining funding available in this grant.
     */
    function cancelGrant()
        public
        returns (uint256 balance);
}
