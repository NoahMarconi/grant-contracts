import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import GrantFactory from "../build/GrantFactory.json";
import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { AddressZero } from "ethers/constants";

chai.use(waffle.solidity);
const { expect } = chai;

describe("Grant", () => {
  const _amounts = [1000];
  const _targetFunding = _amounts.reduce((a, b) => a + b, 0);

  async function fixture(provider: any, wallets: Wallet[]) {
    const currentTime = (
      await provider.getBlock(await provider.getBlockNumber())
    ).timestamp;

    const [granteeWallet, donorWallet, managerWallet] = wallets;

    const token: Contract = await waffle.deployContract(
      donorWallet,
      GrantToken,
      ["Grant Token", "GT", 18]
    );

    const grantWithToken: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [
        [granteeWallet.address],
        _amounts,
        managerWallet.address,
        token.address,
        _targetFunding,
        currentTime + 86400,
        currentTime + 86400 * 2
      ],
      { gasLimit: 6e6 }
    );

    const grantWithEther: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [
        [granteeWallet.address],
        _amounts,
        managerWallet.address,
        AddressZero,
        _targetFunding,
        currentTime + 86400,
        currentTime + 86400 * 2
      ],
      { gasLimit: 6e6 }
    );
    const grantFactory: Contract = await waffle.deployContract(
      donorWallet,
      GrantFactory,
      undefined,
      { gasLimit: 6e6 }
    );

    // Initial token balance.
    await token.mint(donorWallet.address, 1e6);

    const grantFromDonor: Contract = new Contract(
      grantWithToken.address,
      Grant.abi,
      donorWallet
    );
    const grantFromDonorWithEther: Contract = new Contract(
      grantWithEther.address,
      Grant.abi,
      donorWallet
    );
    const grantFromManager: Contract = new Contract(
      grantWithToken.address,
      Grant.abi,
      managerWallet
    );
    const grantFromManagerWithEther: Contract = new Contract(
      grantWithEther.address,
      Grant.abi,
      managerWallet
    );

    return {
      grantFactory,
      grantWithToken,
      grantWithEther,
      grantFromDonor,
      grantFromDonorWithEther,
      grantFromManager,
      grantFromManagerWithEther,
      grantFromGrantee: grantWithToken,
      token,
      granteeWallet,
      donorWallet,
      managerWallet,
      fundingExpiration: currentTime + 86400,
      contractExpiration: currentTime + 86400 * 2,
      provider
    };
  }

  describe("When Funding & Approve refunding", () => {
    describe("With Ether", () => {
      let _grantFromDonorWithEther: Contract;
      let _grantFromManagerWithEther: Contract;
      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;

      let _fundReceipt: any;
      const _fundAmountAfterFunding = 1e3;
      const _refundAmount = 5e1;

      before(async () => {
        const {
          grantFromDonorWithEther,
          grantFromManagerWithEther,
          donorWallet,
          grantFromDonor
        } = await waffle.loadFixture(fixture);

        _grantFromDonorWithEther = grantFromDonorWithEther;
        _grantFromManagerWithEther = grantFromManagerWithEther;
        _donorWallet = donorWallet;
        _grantFromDonor = grantFromDonor;

        // Donor fund Ether
        _fundReceipt = await (
          await _donorWallet.sendTransaction({
            to: _grantFromDonorWithEther.address,
            value: 1e6
          })
        ).wait();
        // console.log('Fund Receipt ' + JSON.stringify(_fundReceipt));
      });

      it("should be funded by donor", async () => {
        expect(await _grantFromDonorWithEther.totalFunding()).to.eq(
          _fundAmountAfterFunding
        );
      });

      it("should revert if donor approves refund", async () => {
        await expect(
          _grantFromDonorWithEther.approveRefund(
            _fundAmountAfterFunding + _refundAmount,
            AddressZero
          )
        ).to.be.revertedWith(
          "onlyManager::Permission Error. Function can only be called by manager"
        );
      });

      it("should revert if manager approves refund which exceeds the avaliable fund ", async () => {
        await expect(
          _grantFromManagerWithEther.approveRefund(
            _fundAmountAfterFunding + _refundAmount,
            AddressZero
          )
        ).to.be.revertedWith(
          "approveRefund::Invalid Argument. Amount is greater than Available Balance."
        );
      });

      it("should be refunded by manager", async () => {
        await _grantFromManagerWithEther.approveRefund(
          _refundAmount,
          AddressZero
        );

        const totalRefunded = await _grantFromManagerWithEther.totalRefunded();
        expect(totalRefunded).to.eq(_refundAmount);

        const availableBalance = await _grantFromDonorWithEther.availableBalance();
        expect(availableBalance).to.eq(_fundAmountAfterFunding - _refundAmount);
      });

      it("should emit Events", async () => {
        let logFundingEvent: any[] = !_fundReceipt.events
          ? []
          : _fundReceipt.events.filter(
              (event: any) => event.event == "LogFunding"
            );
        for (let event of logFundingEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFunding(address,uint256)");
        }

        let LogFundingCompleteEvent: any[] = !_fundReceipt.events
          ? []
          : _fundReceipt.events.filter(
              (event: any) => event.event == "LogFundingComplete"
            );
        for (let event of LogFundingCompleteEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFundingComplete()");
        }

        // const { donor, value } = emittedEvent.args;
        // expect(donor).to.eq(_donorWallet.address);
        // // Only 10000 as change from 15000 was returned.
        // expect(value).to.eq(bigNumberify(10000));
      });

      it("should donor funding balances == fund amount", async () => {
        const donor = await _grantFromDonorWithEther.donors(
          _donorWallet.address
        );
        const { funded, refunded } = donor;

        expect(funded).to.eq(_fundAmountAfterFunding);
        //expect(refunded).to.eq(0);
      });

      it("should grant status to be true", async () => {
        expect(await _grantFromDonor.canFund()).to.be.true;
      });

      // following test case should be last, because Grant is getting cancelled.
      it("should reject funding if grant is already cancelled", async () => {
        await _grantFromManagerWithEther.cancelGrant();
        await expect(
          _donorWallet.sendTransaction({
            to: _grantFromDonorWithEther.address,
            value: 1e6
          })
        ).to.be.revertedWith("fund::Status Error. Grant not open to funding.");
      });
    });

    describe("With Token", () => {
      let _donorWallet: Wallet;
      let _grantFromDonor: Contract;
      let _grantFromManager: Contract;
      const _fundAmount = 500;
      const _refundAmount = 20;
      let _fundReceipt: any;

      before(async () => {
        const {
          donorWallet,
          grantFromDonor,
          token,
          grantFromManager
        } = await waffle.loadFixture(fixture);

        _donorWallet = donorWallet;
        _grantFromDonor = grantFromDonor;
        _grantFromManager = grantFromManager;

        await token.approve(grantFromManager.address, 5000);

        // Donor fund Token
        _fundReceipt = await (await _grantFromDonor.fund(_fundAmount)).wait();
        //console.log('fund Receipt ' + JSON.stringify(_fundReceipt)
      });

      it("should be funded by donor", async () => {
        expect(await _grantFromDonor.totalFunding()).to.eq(_fundAmount);
      });

      it("should revert if donor approves refund", async () => {
        await expect(
          _grantFromDonor.approveRefund(_refundAmount, AddressZero)
        ).to.be.revertedWith(
          "onlyManager::Permission Error. Function can only be called by manager"
        );
      });

      it("should revert if refunded by manager", async () => {
        await expect(
          _grantFromManager.approveRefund(
            _fundAmount + _refundAmount,
            AddressZero
          )
        ).to.be.revertedWith(
          "approveRefund::Invalid Argument. Amount is greater than Available Balance."
        );
      });

      it("should be refunded by manager", async () => {
        await _grantFromManager.approveRefund(_refundAmount, AddressZero);

        const totalRefunded = await _grantFromDonor.totalRefunded();
        expect(totalRefunded).to.eq(_refundAmount);

        const availableBalance = await _grantFromDonor.availableBalance();
        expect(availableBalance).to.eq(_fundAmount - _refundAmount);
      });

      it("should emit Events", async () => {
        let logFundingEvent: any[] = _fundReceipt.events.filter(
          (event: any) => event.event == "LogFunding"
        );
        for (let event of logFundingEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFunding(address,uint256)");
        }

        let LogFundingCompleteEvent: any[] = _fundReceipt.events.filter(
          (event: any) => event.event == "LogFundingComplete"
        );
        for (let event of LogFundingCompleteEvent) {
          const logFundingEvent = event.eventSignature;
          expect(logFundingEvent).to.eq("LogFundingComplete()");
        }
      });

      it("should donor funding balances == fund amount", async () => {
        const donor = await _grantFromDonor.donors(_donorWallet.address);
        const { funded, refunded } = donor;
        expect(funded).to.eq(_fundAmount);
        //expect(refunded).to.eq(0);
      });

      it("should grant status to be true", async () => {
        expect(await _grantFromDonor.canFund()).to.be.true;
      });

      // Pending
      // fund::Transfer Error. ERC20 token transferFrom failed.

      it("should reject if donor fund ether for token funded grants", async () => {
        await expect(_grantFromDonor.fund(_fundAmount, { value: _fundAmount }))
          .to.be.reverted;
        //.to.be.revertedWith("fundWithToken::Currency Error. Cannot send Ether to a token funded grant.");
      });

      // following test case should be last, because Grant is getting cancelled.
      it("should reject funding if grant is already cancelled", async () => {
        await _grantFromManager.cancelGrant();
        await expect(_grantFromDonor.fund(_fundAmount)).to.be.revertedWith(
          "fund::Status Error. Grant not open to funding."
        );
      });
    });
  });

  describe("For Funding, When multiple donors are involved", () => {
    const AMOUNTS = [1000, 500];
    const TARGET_FUNDING = AMOUNTS.reduce((a, b) => a + b, 0);

    async function fixtureWithMultipleGrantee(
      provider: any,
      wallets: Wallet[]
    ) {
      const currentTime = (
        await provider.getBlock(await provider.getBlockNumber())
      ).timestamp;

      const [
        granteeWallet,
        secondGranteeWallet,
        donorWallet,
        secondDonorWallet,
        managerWallet,
        thirdPersonWallet
      ] = wallets;

      const token: Contract = await waffle.deployContract(
        donorWallet,
        GrantToken,
        ["Grant Token", "GT", 18]
      );

      const grantWithToken: Contract = await waffle.deployContract(
        granteeWallet,
        Grant,
        [
          [granteeWallet.address, secondGranteeWallet.address],
          AMOUNTS,
          managerWallet.address,
          token.address,
          TARGET_FUNDING,
          currentTime + 86400,
          currentTime + 86400 * 2
        ],
        { gasLimit: 6e6 }
      );

      // Initial token balance.
      await token.mint(donorWallet.address, 1e6);
      await token.mint(secondDonorWallet.address, 1e6);

      const tokenFromSecondDonor: Contract = new Contract(
        token.address,
        GrantToken.abi,
        secondDonorWallet
      );

      const grantFromDonor: Contract = new Contract(
        grantWithToken.address,
        Grant.abi,
        donorWallet
      );

      const grantFromSecondDonor: Contract = new Contract(
        grantWithToken.address,
        Grant.abi,
        secondDonorWallet
      );

      const grantFromManager: Contract = new Contract(
        grantWithToken.address,
        Grant.abi,
        managerWallet
      );

      return {
        grantWithToken,
        grantFromDonor,
        grantFromSecondDonor,
        grantFromManager,
        token,
        tokenFromSecondDonor,
        granteeWallet,
        secondGranteeWallet,
        donorWallet,
        secondDonorWallet,
        managerWallet,
        thirdPersonWallet,
        provider
      };
    }

    describe("Donors' balance", () => {
      let _grantFromDonor: Contract;
      let _grantFromSecondDonor: Contract;
      let _grantFromManager: Contract;
      //let _granteeWallet: Wallet;
      let _donorWallet: Wallet;
      let _secondDonorWallet: Wallet;

      let _token: Contract;
      //let _secondGranteeWallet: Wallet;
      let lastFundingAmountByDonor: BigNumber;
      let lastFundingAmountBySecondDonor: BigNumber;

      let lastBalanceOfGrant: BigNumber;
      let lastBalanceOfDonor: BigNumber;
      let lastBalanceOfSecondDonor: BigNumber;

      before(async () => {
        const {
          token,
          tokenFromSecondDonor,
          grantFromDonor,
          grantFromSecondDonor,
          grantFromManager,
          donorWallet,
          secondDonorWallet
        } = await waffle.loadFixture(fixtureWithMultipleGrantee);

        _token = token;
        _grantFromDonor = grantFromDonor;
        _grantFromSecondDonor = grantFromSecondDonor;
        _grantFromManager = grantFromManager;

        _donorWallet = donorWallet;
        _secondDonorWallet = secondDonorWallet;

        await token.approve(grantFromDonor.address, TARGET_FUNDING);
        await tokenFromSecondDonor.approve(
          grantFromSecondDonor.address,
          TARGET_FUNDING
        );

        // first donor
        let { funded: fundedByDonor } = await _grantFromManager.donors(
          _donorWallet.address
        );
        lastFundingAmountByDonor = fundedByDonor;
        lastBalanceOfDonor = await _token.balanceOf(_donorWallet.address);

        // second donor
        let { funded: fundedBySecondDonor } = await _grantFromManager.donors(
          _secondDonorWallet.address
        );
        lastFundingAmountBySecondDonor = fundedBySecondDonor;
        lastBalanceOfSecondDonor = await _token.balanceOf(
          _secondDonorWallet.address
        );

        // Grant balance
        lastBalanceOfGrant = await _token.balanceOf(_grantFromDonor.address);
      });

      it("should revert with negative funding", async () => {
        await expect(_grantFromDonor.fund(-1)).to.be.reverted;
      });

      it("should revert with 0 funding", async () => {
        await expect(_grantFromDonor.fund(0)).to.be.reverted;
      });

      it("should be updated with initial funding", async () => {
        const initialBalanceForGrant = lastBalanceOfGrant;

        let fundingAmount = 5e2;

        // first donor
        const initialBalanceOfDonor = lastBalanceOfDonor;

        await _grantFromDonor.fund(fundingAmount);
        let { funded: fundedByDonor } = await _grantFromManager.donors(
          _donorWallet.address
        );
        expect(lastFundingAmountByDonor.add(fundingAmount)).to.be.eq(
          fundedByDonor
        );
        lastFundingAmountByDonor = fundedByDonor;

        const finalBalanceOfDonor = await _token.balanceOf(
          _donorWallet.address
        );

        expect(initialBalanceOfDonor.sub(fundingAmount)).to.be.eq(
          finalBalanceOfDonor
        );
        lastBalanceOfDonor = finalBalanceOfDonor;

        // second donor
        fundingAmount = 250;
        const initialBalanceOfSecondDonor = lastBalanceOfSecondDonor;

        await _grantFromSecondDonor.fund(fundingAmount);

        let { funded: fundedBySecondDonor } = await _grantFromManager.donors(
          _secondDonorWallet.address
        );
        expect(lastFundingAmountBySecondDonor.add(fundingAmount)).to.be.eq(
          fundedBySecondDonor
        );
        lastFundingAmountBySecondDonor = fundedBySecondDonor;
        const finalBalanceOfSecondDonor = await _token.balanceOf(
          _secondDonorWallet.address
        );
        expect(initialBalanceOfSecondDonor.sub(fundingAmount)).to.be.eq(
          finalBalanceOfSecondDonor
        );
        lastBalanceOfSecondDonor = finalBalanceOfSecondDonor;

        // Grant's balance
        const finalBalanceOfGrant = await _token.balanceOf(
          _grantFromDonor.address
        );
        lastBalanceOfGrant = finalBalanceOfGrant;

        expect(initialBalanceForGrant.add(5e2).add(250)).to.be.eq(
          finalBalanceOfGrant
        );
      });

      it("should be updated with final funding", async () => {
        const initialBalanceForGrant = lastBalanceOfGrant;
        let fundingAmount = 250;

        // first donor
        const initialBalanceOfDonor = lastBalanceOfDonor;
        await _grantFromDonor.fund(fundingAmount);
        let { funded: fundedByDonor } = await _grantFromManager.donors(
          _donorWallet.address
        );
        expect(lastFundingAmountByDonor.add(fundingAmount)).to.be.eq(
          fundedByDonor
        );
        lastFundingAmountByDonor = fundedByDonor;

        const finalBalanceOfDonor = await _token.balanceOf(
          _donorWallet.address
        );

        expect(initialBalanceOfDonor.sub(fundingAmount)).to.be.eq(
          finalBalanceOfDonor
        );
        lastBalanceOfDonor = finalBalanceOfDonor;

        // second donor
        fundingAmount = 500;
        const initialBalanceOfSecondDonor = lastBalanceOfSecondDonor;

        await _grantFromSecondDonor.fund(fundingAmount);

        let { funded: fundedBySecondDonor } = await _grantFromManager.donors(
          _secondDonorWallet.address
        );
        expect(lastFundingAmountBySecondDonor.add(fundingAmount)).to.be.eq(
          fundedBySecondDonor
        );
        lastFundingAmountBySecondDonor = fundedBySecondDonor;
        const finalBalanceOfSecondDonor = await _token.balanceOf(
          _secondDonorWallet.address
        );
        expect(initialBalanceOfSecondDonor.sub(fundingAmount)).to.be.eq(
          finalBalanceOfSecondDonor
        );
        lastBalanceOfSecondDonor = finalBalanceOfSecondDonor;

        // Grant' balance
        const finalBalanceOfGrant = await _token.balanceOf(
          _grantFromDonor.address
        );
        lastBalanceOfGrant = finalBalanceOfGrant;

        expect(initialBalanceForGrant.add(250).add(500)).to.be.eq(
          finalBalanceOfGrant
        );
      });
    });
  });
});
