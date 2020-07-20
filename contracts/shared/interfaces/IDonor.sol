// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;
pragma experimental ABIEncoderV2;

/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi
 */
interface IDonor {

    /*----------  Types  ----------*/

    struct Donor {
        uint256 funded;          // Total amount funded.
        uint256 refunded;        // Cumulative amount refunded.
    }


    /*----------  Public Getters  ----------*/

    /**
     * @dev Get Donor struct by address.
     * @param donor address of donor to get.
     */
    function getDonor(address donor)
        external
        view
        returns(Donor memory);

    /**
     * @dev Get Donor funded amount by address.
     * @param donor address of donor to get.
     */
    function getDonorFunded(address donor)
        external
        view
        returns(uint256);

    /**
     * @dev Get Donor refunded amount by address.
     * @param donor address of donor to get.
     */
    function getDonorRefunded(address donor)
        external
        view
        returns(uint256);


    /*----------  Public Setters  ----------*/

    /**
     * @dev Set Donor funded amount by address.
     * @param donor address of donor to set.
     */
    function setDonorFunded(address donor, uint256 amount)
        external;

    /**
     * @dev Get Donor refunded amount by address.
     * @param donor address of donor to set.
     */
    function setDonorRefunded(address donor, uint256 amount)
        external;


}
