// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "./abdk-libraries/ABDKMathQuad.sol";

/**
 * @title Percentage Helpers for Grant Contracts.
 * @author @NoahMarconi
 */
library Percentages {

    function percentage(uint256 numerator, uint256 denominator)
        internal
        pure
        returns (bytes16)
    {
        bytes16 num = ABDKMathQuad.fromUInt(numerator);
        bytes16 den = ABDKMathQuad.fromUInt(denominator);

        return ABDKMathQuad.div(num, den);
    }

    function percentTimesTotal(bytes16 percent, uint256 total)
        internal
        pure
        returns (uint256)
    {
        bytes16 tot = ABDKMathQuad.fromUInt(total);
        bytes16 res = ABDKMathQuad.mul(tot, percent);

        return ABDKMathQuad.toUInt(res);
    }

    function maxAllocation(uint256 contribution, uint256 totalPool, uint256 remainingPool)
        internal
        pure
        returns (uint256)
    {
        bytes16 contributionPercent = Percentages.percentage(
            contribution,
            totalPool
        );

        uint256 contributionMaxAllocation = Percentages.percentTimesTotal(
            contributionPercent,
            remainingPool
        );

        return contributionMaxAllocation;
    }
}