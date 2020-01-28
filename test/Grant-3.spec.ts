import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import GrantFactory from "../build/GrantFactory.json";
import chai from 'chai';
import * as waffle from "ethereum-waffle";
import { Contract, Wallet, constants } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { Web3Provider, Provider } from "ethers/providers";
import { bigNumberify, randomBytes, solidityKeccak256, id } from "ethers/utils";
import { AddressZero } from "ethers/constants";


chai.use(waffle.solidity);
const { expect, assert } = chai;

describe("Grant", () => {

  const GrantStatus = {
    INIT:     0,
    SUCCESS:  1,
    DONE:     2
  }

  async function fixture(provider: any, wallets: Wallet[]) {

    const currentTime = (await provider.getBlock(await provider.getBlockNumber())).timestamp;
    const [granteeWallet, donorWallet, managerWallet] = wallets;
    const token: Contract = await waffle.deployContract(donorWallet, GrantToken, ["Grant Token", "GT", 18]);

    const grantWithToken: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [[granteeWallet.address], [1000], managerWallet.address, token.address, 1000, currentTime + 86400, currentTime + (86400 * 2)],
      { gasLimit: 6e6 }
    );

    const grantWithEther: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [[granteeWallet.address], [1000], managerWallet.address, AddressZero, 1000, currentTime + 86400, currentTime + (86400 * 2)],
      { gasLimit: 6e6 }
    );

    const grantFactory: Contract = await waffle.deployContract(donorWallet, GrantFactory, undefined, { gasLimit: 6e6 });

    // Initial token balance.
    await token.mint(donorWallet.address, 1e6);
    

    const grantFromDonor: Contract = new Contract(grantWithToken.address, Grant.abi, donorWallet);
    const grantFromDonorWithEther: Contract = new Contract(grantWithEther.address, Grant.abi, donorWallet);
    const grantFromManager: Contract = new Contract(grantWithToken.address, Grant.abi, managerWallet);
    const grantFromManagerWithEther: Contract = new Contract(grantWithEther.address, Grant.abi, managerWallet);

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
      contractExpiration: currentTime + (86400 * 2),
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
    let _granteeWallet: Wallet;

    let _token: Contract;
      

    before(async () => {
      const {
        grantFromDonor,
        grantFromDonorWithEther,
        token,
        granteeWallet,
        donorWallet,
        provider,
        
      } = await waffle.loadFixture(fixture);
      _donorAddress = donorWallet.address;
      _grantFromDonorWithEther = grantFromDonorWithEther;
      _provider = provider;
      _granteeWallet = granteeWallet;


        _grantFromDonor = grantFromDonor;
        _token = token;
        _provider = provider;
        _granteeWallet = granteeWallet;
    });

    describe("When Ether", () => {
    
      it("should fail if ether sent does not match value arg", async () => {
        await expect(_grantFromDonorWithEther.signal(_positiveSupport, 1e6))
          .to.be.revertedWith("signal::Invalid Argument. value must match msg.value.");
      });

      it("should emit LogSignal event", async () => {
        await expect(_grantFromDonorWithEther.signal(_positiveSupport, 1e6, { value: 1e6 }))
          .to.emit(_grantFromDonorWithEther, "LogSignal")
          .withArgs(_positiveSupport, _donorAddress, constants.AddressZero, 1e6);
      });

      it("sender should have their funds returned", async () => {
        const startingBalance = await _provider.getBalance(_donorAddress);
        // Set gas price to 1 to make it simple to calc gas spent in eth. 
        const receipt = await (await _grantFromDonorWithEther.signal(_positiveSupport, 1e6, { value: 1e6, gasPrice: 1 })).wait();
        const endingBalance = await _provider.getBalance(_donorAddress);
        expect(endingBalance).to.eq(startingBalance.sub(receipt.gasUsed));
      });

      describe.skip("After funding success", () => {
        before(async () => {
          await _grantFromDonorWithEther.fund(10, { value: 10, gasPrice: 1 });
        });

        it("should revert", async () => {
          await expect(_grantFromDonorWithEther.signal(_positiveSupport, 1e6, { value: 1e6 }))
            .to.be.revertedWith("signal::Status Error. Must be GrantStatus.INIT to signal.00");
        });

      });
    });

    describe("When Token", () => {
      // let _grantFromDonor: Contract;
      // let _token: Contract;
      // let _donorAddress: string;
      // let _provider: any;
      // let _granteeWallet: Wallet;

      // before(async () => {
      //   const {
      //     grantFromDonor,
      //     token,
      //     donorWallet,
      //     provider,
      //     granteeWallet
      //   } = await waffle.loadFixture(fixture);
      //   _donorAddress = donorWallet.address;
      //   _grantFromDonor = grantFromDonor;
      //   _token = token;
      //   _provider = provider;
      //   _granteeWallet = granteeWallet;
      // });

      
      it("should fail if tokens no approved", async () => {
        await expect(_grantFromDonor.signal(_positiveSupport, 1))
          .to.be.revertedWith("SafeMath: subtraction overflow");
      });
        

      describe("When approved", async () => {
        
        beforeEach(async () => {
          await _token.approve(_grantFromDonor.address, 1e6);
        });
          
        it("should reject ether signalling for token funded grants", async () => {
          await expect(_grantFromDonor.signal(_positiveSupport, 1e6, { value: 1e6 }))
            .to.be.revertedWith("signal::Currency Error. Cannot send Ether to a token funded grant.");
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
      let _donorWallet: Wallet;
     // let _grantFromGrantee: Contract;
      let _grantFromDonor: Contract;
     // let _token: Contract;
      let _grantFromManager: Contract;
      let _provider: any;
      let _res: any;
  
      describe("With Ether", () => {
  
        before(async () => {
          const {
            donorWallet,
            managerWallet,
            grantFromDonorWithEther,
            grantFromManagerWithEther,
            provider
          } = await waffle.loadFixture(fixture);
  
          _donorWallet = donorWallet;
          _managerWallet = managerWallet;
          _grantFromDonor = grantFromDonorWithEther;
          _grantFromManager = grantFromManagerWithEther;
          _provider = provider;
        });
  
        // Pending
        describe.skip("when refund received", () => {
         // let _grantFromManager: Contract;
  
          before(async () => {
            const { grantFromManagerWithEther } = await waffle.loadFixture(fixture);
            _grantFromManager = grantFromManagerWithEther;
            
            const transferReceipt = await _donorWallet.sendTransaction({ to: _grantFromManager.address, value: 5000 });
            console.log("Transfer receipt ", JSON.stringify(transferReceipt));
            
            await _grantFromManager.refund(_donorWallet.address);       
          });
  
         // console.log('_grantFromManager '  + _grantFromManager);
          it("should revert if sender has received a refund", async () => {
            // Refund approved.
            let receipt = await expect(_donorWallet.sendTransaction(
              { to: _grantFromManager.address, value: 5000 }
            ));
            //.to.be.reverted;

            console.log("Receipt " + JSON.stringify(receipt));
            
            //.to.be.revertedWith("fund::Error. Cannot fund if previously approved for, or received, refund.00");
            
            // Refund received.
           await _grantFromDonor.refund(_donorWallet.address);
            await expect(_donorWallet.sendTransaction(
              { to: _grantFromManager.address, value: 5000 }
            )).to.be.revertedWith("fund::Error. Cannot fund if previously approved for, or received, refund.");
  
          });
        });
  
        // Pending
        describe.skip("when grant can not be funded", () => {
          let _grantFromDonor: Contract;
  
          before(async () => {
            const { grantFromDonorWithEther } = await waffle.loadFixture(fixture);
            _grantFromDonor = grantFromDonorWithEther;
            let receipt = await _donorWallet.sendTransaction(
              { to: _grantFromDonor.address, value: 10000 }
            );
            //console.log("Receipt " + JSON.stringify(receipt));
            
            expect(await _grantFromDonor.canFund()).to.be.false;
            
            //expect(await _grantFromDonor.grantStatus()).to.be.eq(GrantStatus.SUCCESS);
          });
  
          it("should revert", async () => {
            await expect(_donorWallet.sendTransaction(
              { to: _grantFromDonor.address, value: 10000 }
            )).to.be.revertedWith("fund::Status Error. Must be GrantStatus.INIT to fund.");
          });
          
        });
  
        describe("when grant status is cancelled", () => {
          let _grantFromManager: Contract;
          let _grantFromDonor: Contract;
  
          before(async () => {
            const { grantFromManagerWithEther, grantFromDonorWithEther }
             = await waffle.loadFixture(fixture);
            
            _grantFromManager = grantFromManagerWithEther;
            _grantFromDonor = grantFromDonorWithEther;
          });

          it("should grant not be cancelled by donor", async() => {
            await _managerWallet.sendTransaction(
              { to: _grantFromDonor.address, value: 5000 }
            );
            await expect(_grantFromDonor.cancelGrant())
            .to.be.revertedWith("cancelGrant::Invalid Sender. Sender must be manager or expired.");
          });

          it("should grant be cancelled", async () => {
            await expect(_grantFromManager.cancelGrant())
              .to.emit(_grantFromManager, "LogGrantCancellation")
              .withArgs();
            expect(await _grantFromManager.grantCancelled()).to.be.true;
          });

          it("should grant not be cancelled again", async() => {
            await expect(_grantFromManager.cancelGrant())
              .to.be.revertedWith("cancelGrant::Status Error. Already cancelled.");
          });


          // it("should revert", async () => {  Not Done
        
          //   await expect(_donorWallet.sendTransaction(
          //     { to: _grantFromManager.address, value: 10000 }
          //   )).to.be.revertedWith("fund::Status Error. Must be GrantStatus.INIT to fund.00");
          // });
  
        });

      });
  
    });

  });

});
