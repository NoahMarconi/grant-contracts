import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import GrantFactory from "../build/GrantFactory.json";
import chai from "chai";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet, constants } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { Web3Provider, Provider } from "ethers/providers";
import { bigNumberify, randomBytes, solidityKeccak256, id } from "ethers/utils";
import { AddressZero } from "ethers/constants";

chai.use(waffle.solidity);
const { expect, assert } = chai;

describe("Grant", () => {
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
        [1000],
        managerWallet.address,
        token.address,
        1000,
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
        [1000],
        managerWallet.address,
        AddressZero,
        1000,
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

    //await token.mint(grantFromDonor.address, 1e8);

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
      provider,
      wallets
    };
  }

  describe("Signaling", () => {
    const _positiveSupport = true;
    const _negativeSupport = false;

    let _grantFromDonor: Contract;
    let _grantFromDonorWithEther: Contract;
    let _donorAddress: string;
    let _provider: any;
    let _donorWallet: Wallet;
    let _token: Contract;

    before(async () => {
      const {
        grantFromDonor,
        grantFromDonorWithEther,
        token,
        donorWallet,
        provider
      } = await waffle.loadFixture(fixture);
      _donorAddress = donorWallet.address;
      _grantFromDonorWithEther = grantFromDonorWithEther;
      _provider = provider;
      _grantFromDonor = grantFromDonor;
      _token = token;
      _provider = provider;
      _donorWallet = donorWallet;
    });

    describe("When Ether", () => {
      it("should fail if ether sent does not match value arg", async () => {
        await expect(
          _grantFromDonorWithEther.signal(_positiveSupport, 1e6)
        ).to.be.revertedWith(
          "signal::Invalid Argument. value must match msg.value."
        );
      });

      it("should emit LogSignal event", async () => {
        await expect(
          _grantFromDonorWithEther.signal(_positiveSupport, 1e6, { value: 1e6 })
        )
          .to.emit(_grantFromDonorWithEther, "LogSignal")
          .withArgs(
            _positiveSupport,
            _donorAddress,
            constants.AddressZero,
            1e6
          );
      });

      it("sender should have their funds returned", async () => {
        const startingBalance = await _provider.getBalance(_donorAddress);
        // Set gas price to 1 to make it simple to calc gas spent in eth.
        const receipt = await (
          await _grantFromDonorWithEther.signal(_positiveSupport, 1e6, {
            value: 1e6,
            gasPrice: 1
          })
        ).wait();
        const endingBalance = await _provider.getBalance(_donorAddress);
        expect(endingBalance).to.eq(startingBalance.sub(receipt.gasUsed));
      });

      describe("After funding again with Ether", () => {
        before(async () => {
          await _donorWallet.sendTransaction({
            to: _grantFromDonorWithEther.address,
            value: 1e6
          });
        });

        it("should revert", async () => {
          await expect(
            _grantFromDonorWithEther.signal(_positiveSupport, 1e6, {
              value: 1e6
            })
          ).to.be.revertedWith("signal::Status Error. Funding target reached");
        });
      });
    });

    describe("When Token", () => {
      it("should fail if tokens no approved", async () => {
        await expect(
          _grantFromDonor.signal(_positiveSupport, 1)
        ).to.be.revertedWith("SafeMath: subtraction overflow");
      });

      describe("When approved", async () => {
        beforeEach(async () => {
          await _token.approve(_grantFromDonor.address, 1e6);
        });

        it("should reject ether signalling for token funded grants", async () => {
          await expect(
            _grantFromDonor.signal(_positiveSupport, 1e6, { value: 1e6 })
          ).to.be.revertedWith(
            "signal::Currency Error. Cannot send Ether to a token funded grant."
          );
        });

        it("should emit LogSignal event", async () => {
          await expect(_grantFromDonor.signal(_positiveSupport, 1e6))
            .to.emit(_grantFromDonor, "LogSignal")
            .withArgs(_positiveSupport, _donorAddress, _token.address, 1e6);
        });

        it("sender should have their funds returned", async () => {
          await _grantFromDonor.signal(_positiveSupport, 1e6);
          const endingBalance = await _token.balanceOf(_donorAddress);
          expect(endingBalance).to.eq(1e6);
        });
      });
    });

    describe("Fund Grant", () => {
      let _managerWallet: Wallet;

      describe("With Ether", () => {
        before(async () => {
          const {
            donorWallet,
            managerWallet,
            provider
          } = await waffle.loadFixture(fixture);

          _donorWallet = donorWallet;
          _managerWallet = managerWallet;
          _provider = provider;
        });

        describe("when grant status is cancelled", () => {
          let _grantFromManager: Contract;
          let _grantFromDonor: Contract;

          before(async () => {
            const {
              grantFromManagerWithEther,
              grantFromDonorWithEther
            } = await waffle.loadFixture(fixture);

            _grantFromManager = grantFromManagerWithEther;
            _grantFromDonor = grantFromDonorWithEther;
          });

          it("should grant not be cancelled by donor", async () => {
            await _managerWallet.sendTransaction({
              to: _grantFromDonor.address,
              value: 5000
            });
            await expect(_grantFromDonor.cancelGrant()).to.be.revertedWith(
              "cancelGrant::Invalid Sender. Sender must be manager or expired."
            );
          });

          it("should grant be cancelled", async () => {
            await expect(_grantFromManager.cancelGrant())
              .to.emit(_grantFromManager, "LogGrantCancellation")
              .withArgs();
            expect(await _grantFromManager.grantCancelled()).to.be.true;
          });

          it("should grant not be cancelled again", async () => {
            await expect(_grantFromManager.cancelGrant()).to.be.revertedWith(
              "cancelGrant::Status Error. Already cancelled."
            );
          });
        });
      });
    });
  });
});
