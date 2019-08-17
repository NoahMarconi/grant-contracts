import Grant from "../build/Grant.json";
import GrantToken from "../build/GrantToken.json";
import chai from 'chai';
import * as waffle from "ethereum-waffle";
import { Contract, Wallet, constants } from "ethers";
import { BigNumber } from "ethers/utils/bignumber";
import { Web3Provider, Provider } from "ethers/providers";
import { bigNumberify, solidityKeccak256, id } from "ethers/utils";
import { AddressZero } from "ethers/constants";


chai.use(waffle.solidity);
const {expect} = chai;

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
    const grant: Contract = await waffle.deployContract(
      granteeWallet,
      Grant,
      [[granteeWallet.address], [1000], managerWallet.address, token.address, 10000, currentTime + 86400, currentTime + (86400 * 2)],
      { gasLimit: 6e6 }
    );

    // Initial token balance.
    await token.mint(donorWallet.address, 1e6);

    const grantFromDonor: Contract = new Contract(grant.address, Grant.abi, donorWallet);
    const grantFromManager: Contract = new Contract(grant.address, Grant.abi, managerWallet);

    return {
      grant,
      grantFromDonor,
      grantFromManager,
      grantFromGrantee: grant,
      token,
      granteeWallet,
      donorWallet,
      managerWallet,
      fundingExpiration: currentTime + 86400,
      contractExpiration: currentTime + (86400 * 2),
      provider
    };
  }


  describe("Create Grant", () => {
    let _granteeAddress: string;
    let _grantorAddress: string;
    let _managerAddress: string;
    let _fundingExpiration: BigNumber;
    let _contractExpiration: BigNumber;
    let _grant: Contract;
    let _token: Contract;

    describe("When created", () => {
      before(async () => {
        const {
          grant,
          token,
          granteeWallet,
          donorWallet,
          managerWallet,
          fundingExpiration,
          contractExpiration
        } = await waffle.loadFixture(fixture);
        _granteeAddress = granteeWallet.address;
        _grantorAddress = donorWallet.address;
        _managerAddress = managerWallet.address;
        _fundingExpiration = fundingExpiration;
        _contractExpiration = contractExpiration;
        _grant = grant;
        _token = token;
      });
      
      it("should persist the correct overall funding target", async () => {
        const targetFunding = await _grant.targetFunding();
        expect(targetFunding).to.eq(10000);
      });

      it("should persist the correct grantee funding target", async () => {
        const grantee = await _grant.getGrantee(_granteeAddress);        
        expect(grantee.targetFunding).to.eq(1000);
      });

      it("should persist the correct manager", async () => {
        const manager = await _grant.manager();
        expect(manager).to.eq(_managerAddress);
      });

      it("should persist the correct currency", async () => {
        const currency = await _grant.currency();
        expect(currency).to.eq(_token.address);
      });

      it("should persist the correct fundingExpiration", async () => {
        const fundingExpiration = await _grant.fundingExpiration();
        expect(fundingExpiration).to.eq(_fundingExpiration);
      });

      it("should persist the correct contractExpiration", async () => {
        const contractExpiration = await _grant.contractExpiration();
        expect(contractExpiration).to.eq(_contractExpiration);
      });

      it("should persist the correct grantStatus", async () => {
        const grantStatus = await _grant.grantStatus();
        expect(grantStatus).to.eq(GrantStatus.INIT);
      });
    });

  });

  // describe("Signaling", () => {

  //   describe("Signal", () => {
      
  //     describe("When Ether", () => {
  //       let _id: string;
  //       let _grantFromGrantee: Contract;
  //       let _grantFromDonor: Contract;
  //       let _grantorAddress: string;
  //       let _res: any;
  //       let _provider: any;
        
  //       before(async () => {
  //         const {
  //           grant,
  //           granteeWallet,
  //           donorWallet,
  //           managerWallet,
  //           grantFromGrantee,
  //           grantFromDonor,
  //           provider
  //         } = await waffle.loadFixture(fixture);
    
  //         const res = await grant.create(
  //           [{ grantee: granteeWallet.address, allocation: 100, payments: [], received: 0 }],
  //           [{ grantManager: managerWallet.address, weight: 100 }],
  //           constants.AddressZero,
  //           1000,
  //           0,
  //           0,
  //           GrantType.FUND_THRESHOLD,
  //           [0x0]
  //         );
      
  //         const receipt = await res.wait();
  //         _id = receipt.events[0].args.id;
  //         _grantFromGrantee = grantFromGrantee;
  //         _grantFromDonor = grantFromDonor;
  //         _grantorAddress = donorWallet.address;
  //         _provider = provider;
  //       });

  //       it("should fail if not initialized.", async () => {
  //         await expect(
  //           _grantFromDonor.signal(id("anything"), 1e6)
  //         ).to.be.revertedWith("signal::Status Error. Must be GrantStatus.SIGNAL to signal.");
  //       });

  //       it("should fail if ether sent does not match value arg.", async () => {
  //         await expect(
  //           _grantFromDonor.signal(_id, 1e6)
  //         ).to.be.revertedWith("signal::Invalid Argument. value must match msg.value.");
  //       });

  //       it("should emit LogSignal event", async () => {
  //         await expect(_grantFromDonor.signal(_id, 1e6, { value: 1e6 }))
  //           .to.emit(_grantFromDonor, "LogSignal")
  //           .withArgs(_id, _grantorAddress, constants.AddressZero, 1e6);
  //       });

  //       it("sender should have their funds returned", async () => {
  //         const startingBalance = await _provider.getBalance(_grantorAddress);
  //         // Set gas price to 1 to make it simple to calc gas spent in eth. 
  //         const receipt = await (await _grantFromDonor.signal(_id, 1e6, { value: 1e6, gasPrice: 1 })).wait();
  //         const endingBalance = await _provider.getBalance(_grantorAddress);

  //         expect(endingBalance).to.eq(startingBalance.sub(receipt.gasUsed));
  //       });

  //       describe("End Signaling", () => {
  
  //         describe("When sender is a grantee", () => {
  //           let receipt: any;
      
  //           it("should update the grantStatus", async () => {
  //             const res = await _grantFromGrantee.endSignaling(_id);
  //             receipt = await res.wait();
  //             const {
  //               grantStatus
  //             } = await _grantFromGrantee.getGrant(_id);
              
  //             expect(grantStatus).to.eq(GrantStatus.FUND);
  //           });
      
  //           it("should emit LogStatusChange event", async () => {
  //             const emittedEvent = receipt.events[0];
  //             expect(emittedEvent.event).to.eq("LogStatusChange");
  //             expect(emittedEvent.eventSignature).to.eq("LogStatusChange(bytes32,uint8)");
  //             expect(emittedEvent.args).to.include({ id: _id, grantStatus: GrantStatus.FUND });
  //           });
  //         });
      
  //         describe("When sender is not a grantee", () => {
      
  //           it("should revert", async () => {
  //             await expect(_grantFromDonor.endSignaling(_id))
  //               .to.be.revertedWith("isGrantee::Invalid Sender. Sender is not a grantee for this grant.");
  //           });
  //         });
  //       });
  //     });

  //     describe("When Token", () => {
  //       let _id: string;
  //       let _grantFromGrantee: Contract;
  //       let _grantFromDonor: Contract;
  //       let _grantorAddress: string;
  //       let _res: any;
  //       let _token: Contract;

  //       before(async () => {
  //         const {
  //           grant,
  //           granteeWallet,
  //           donorWallet,
  //           managerWallet,
  //           grantFromGrantee,
  //           grantFromDonor,
  //           token
  //         } = await waffle.loadFixture(fixture);
    
  //         const res = await grant.create(
  //           [{ grantee: granteeWallet.address, allocation: 100, payments: [], received: 0 }],
  //           [{ grantManager: managerWallet.address, weight: 100 }],
  //           token.address,
  //           1000,
  //           0,
  //           0,
  //           GrantType.FUND_THRESHOLD,
  //           [0x0]
  //         );
      
  //         const receipt = await res.wait();
  //         _id = receipt.events[0].args.id;
  //         _grantFromGrantee = grantFromGrantee;
  //         _grantFromDonor = grantFromDonor;
  //         _grantorAddress = donorWallet.address;
  //         _token = token;
  //       });

  //       it("should fail if not initialized.", async () => {
  //         await expect(
  //           _grantFromDonor.signal(id("anything"), 1e6)
  //         ).to.be.revertedWith("signal::Status Error. Must be GrantStatus.SIGNAL to signal.");
  //       });

  //       it("should fail if tokens no approved.", async () => {
  //         await expect(
  //           _grantFromDonor.signal(_id, 1e6)
  //         ).to.be.revertedWith("SafeMath: subtraction overflow");
  //       });

  //       describe("When approved", async () => {
          
  //         beforeEach(async () => {
  //           await _token.approve(_grantFromGrantee.address, 1e6);
  //         });

  //         it("should emit LogSignal event", async () => {
  //           await expect(_grantFromDonor.signal(_id, 1e6, { value: 1e6 }))
  //             .to.emit(_grantFromDonor, "LogSignal")
  //             .withArgs(_id, _grantorAddress, _token.address, 1e6);
  //         });
  
  //         it("sender should have their funds returned", async () => {
  //           await _grantFromDonor.signal(_id, 1e6, { value: 1e6, gasPrice: 1 });
  //           const endingBalance = await _token.balanceOf(_grantorAddress);
  
  //           expect(endingBalance).to.eq(1e6);
  //         });
  //       });

  //     });
  //   });


  // });

  // describe("Fund Grant", () => {

  //   let _granteeWallet: Wallet;
  //   let _donorWallet: Wallet;
  //   let _managerWallet: Wallet;
  //   let _grantFromGrantee: Contract;
  //   let _grantFromDonor: Contract;
  //   let _token: Contract;
  //   let _provider: any;
  //   let _res: any;
  //   let _id: string;

  //   describe("With Ether", () => {

  //     before(async () => {
  //       const {
  //         granteeWallet,
  //         donorWallet,
  //         managerWallet,
  //         grantFromGrantee,
  //         grantFromDonor,
  //         provider
  //       } = await waffle.loadFixture(fixture);

  //       _granteeWallet = granteeWallet;
  //       _donorWallet = donorWallet;
  //       _managerWallet = managerWallet;
  //       _grantFromGrantee = grantFromGrantee;
  //       _grantFromDonor = grantFromDonor;
  //       _provider = provider;
  //     });

  //     describe("When funding tx complete", () => {

  //       before(async () => {

  //         const res = await _grantFromGrantee.create(
  //           [{ grantee: _granteeWallet.address, allocation: 100, payments: [], received: 0 }],
  //           [{ grantManager: _managerWallet.address, weight: 100 }],
  //           constants.AddressZero,
  //           10000,
  //           0,
  //           0,
  //           GrantType.FUND_THRESHOLD,
  //           [0x0]
  //         );
      
  //         const receipt = await res.wait();
  //         const previousBlockHash = (await _provider.getBlock(receipt.blockNumber - 1)).hash;
  //         _id = solidityKeccak256(
  //           ["address", "bytes32"],
  //           [_granteeWallet.address, previousBlockHash]
  //         );
  //         await _grantFromGrantee.endSignaling(_id);
  //         _res = await (await _grantFromDonor.fund(_id, 10000, { value: 10000 })).wait();
  //       });

  //       it("should emit LogFunding event", async () => {
  //         const emittedEvent = _res.events[0];
  //         expect(emittedEvent.event).to.eq("LogFunding");
  //         expect(emittedEvent.eventSignature).to.eq("LogFunding(bytes32,address,uint256)");

  //         const { id, grantor, value } = emittedEvent.args;
  //         expect(id).to.eq(_id);
  //         expect(grantor).to.eq(_donorWallet.address);
  //         expect(value).to.eq(bigNumberify(10000));
  //       });

  //       it("should emit LogStatusChange event", async () => {
  //         const emittedEvent = _res.events[1];
  //         expect(emittedEvent.event).to.eq("LogStatusChange");
  //         expect(emittedEvent.eventSignature).to.eq("LogStatusChange(bytes32,uint8)");
  //         expect(emittedEvent.args).to.include({ id: _id, grantStatus: GrantStatus.PAY });
  //       });

  //       describe("Grant data", () => {
  //         let grantDetail: any;

  //         before(async () => {
  //           grantDetail = await _grantFromGrantee.getGrant(_id);
  //         });

  //         it("should update grantor mapping", async () => {
  //           const grantorsStruct = await _grantFromGrantee.getGrantor(_id, _donorWallet.address);
  //           const { grantor, isGrantor, funded, refunded } = grantorsStruct;

  //           expect(grantor).to.eq(_donorWallet.address);
  //           expect(isGrantor).to.be.true;
  //           expect(funded).to.eq(10000);
  //           expect(refunded).to.eq(0);
  //         });

  //         it("should update totalFunded", () => {
  //           const { totalFunded } = grantDetail;
  //           expect(totalFunded).to.eq(10000);
  //         });

  //         it("should update grantStatus", () => {
  //           const { grantStatus } = grantDetail;
  //           expect(grantStatus).to.eq(GrantStatus.PAY);
  //         });
          
  //       });


  //       it("should update the contract balance", async () => {
  //         const balance = await _provider.getBalance(_grantFromGrantee.address);
  //         expect(balance).to.eq(10000)
  //       });
  //     });
  //   });

  //   describe("With Token", () => {

  //     before(async () => {
  //       const {
  //         granteeWallet,
  //         donorWallet,
  //         managerWallet,
  //         grantFromGrantee,
  //         grantFromDonor,
  //         provider,
  //         token
  //       } = await waffle.loadFixture(fixture);

  //       _granteeWallet = granteeWallet;
  //       _donorWallet = donorWallet;
  //       _managerWallet = managerWallet;
  //       _grantFromGrantee = grantFromGrantee;
  //       _grantFromDonor = grantFromDonor;
  //       _token = token;
  //       _provider = provider;
  //     });

  //     describe("When funding tx complete", () => {
  //       before(async () => {
  //         await _token.approve(_grantFromGrantee.address, 1e5);

  //         const res = await _grantFromGrantee.create(
  //           [{ grantee: _granteeWallet.address, allocation: 100, payments: [], received: 0 }],
  //           [{ grantManager: _managerWallet.address, weight: 100 }],
  //           _token.address,
  //           10000,
  //           0,
  //           0,
  //           GrantType.FUND_THRESHOLD,
  //           [0x0]
  //         );
      
  //         const receipt = await res.wait();
  //         const previousBlockHash = (await _provider.getBlock(receipt.blockNumber - 1)).hash;
  //         _id = solidityKeccak256(
  //           ["address", "bytes32"],
  //           [_granteeWallet.address, previousBlockHash]
  //         );
  //         await _grantFromGrantee.endSignaling(_id);
  //         _res = await (await _grantFromDonor.fund(_id, 10000)).wait();
  //       });

  //       it("should emit LogFunding event", async () => {
  //         const emittedEvent = _res.events[2];
  //         expect(emittedEvent.event).to.eq("LogFunding");
  //         expect(emittedEvent.eventSignature).to.eq("LogFunding(bytes32,address,uint256)");

  //         const { id, grantor, value } = emittedEvent.args;
  //         expect(id).to.eq(_id);
  //         expect(grantor).to.eq(_donorWallet.address);
  //         expect(value).to.eq(bigNumberify(10000));
  //       });

  //       it("should emit LogStatusChange event", async () => {
  //         const emittedEvent = _res.events[3];
  //         expect(emittedEvent.event).to.eq("LogStatusChange");
  //         expect(emittedEvent.eventSignature).to.eq("LogStatusChange(bytes32,uint8)");
  //         expect(emittedEvent.args).to.include({ id: _id, grantStatus: GrantStatus.PAY });
  //       });

  //       describe("Grant data", () => {
  //         let grantDetail: any;

  //         before(async () => {
  //           grantDetail = await _grantFromGrantee.getGrant(_id);
  //         });

  //         it("should update grantor mapping", async () => {
  //           const grantorsStruct = await _grantFromGrantee.getGrantor(_id, _donorWallet.address);
  //           const { grantor, isGrantor, funded, refunded } = grantorsStruct;
            
  //           expect(grantor).to.eq(_donorWallet.address);
  //           expect(isGrantor).to.be.true;
  //           expect(funded).to.eq(10000);
  //           expect(refunded).to.eq(0);
  //         });

  //         it("should update totalFunded", () => {
  //           const { totalFunded } = grantDetail;
  //           expect(totalFunded).to.eq(10000);
  //         });
          
  //         it("should update grantStatus", () => {
  //           const { grantStatus } = grantDetail;
  //           expect(grantStatus).to.eq(GrantStatus.PAY);
  //         });
  //       });

  //       it("should update the contract balance", async () => {
  //         const balance = await _token.balanceOf(_grantFromGrantee.address);
  //         expect(balance).to.eq(10000)
  //       });

  //     });

  //     it("should fail if expired");
  //     it("should fail if wrong grantStatus");
  //   });
  // });

  // describe("Cancel Grant", () => {
  //   it("should fail if wrong status");
  //   it("should permit Grantee to cancel");
  //   it("should permit GrantManager to cancel");
  //   it("should fail if not Grantee or GrantManager");
  //   it("should emit LogStatusChange event COMPLETE");
  //   it("should emit LogStatusChange event REFUND");
  // });

});
