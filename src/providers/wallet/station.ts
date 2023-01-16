import { fromBech32, toBech32 } from "@cosmjs/encoding";
import { AccountData, EncodeObject } from "@cosmjs/proto-signing";
import { DeliverTxResponse } from "@cosmjs/stargate";
import { ChainInfo } from "@keplr-wallet/types";
import { Msg } from "@terra-money/feather.js";
import {
  ConnectedWallet,
  ConnectType,
  WalletController,
} from "@terra-money/wallet-controller";
import { registry } from "kujira.js";

// import { getChainOptions } from "@terra-money/wallet-provider";

export class Station {
  private constructor(
    private controller: WalletController,
    private wallet: ConnectedWallet,
    public account: AccountData,
    private config: ChainInfo
  ) {}

  static connect = async (
    config: ChainInfo,
    opts: { controller: WalletController }
  ): Promise<Station> => {
    const { controller } = opts;

    await controller.connect(ConnectType.EXTENSION);
    const wallet: ConnectedWallet = await new Promise((r) =>
      controller.connectedWallet().subscribe((next) => {
        next && r(next);
      })
    );

    const account: AccountData = {
      address: toBech32(
        "kujira",
        fromBech32(wallet.addresses[config.chainId]).data
      ),
      algo: "secp256k1",
      pubkey: Buffer.from(""),
    };
    return new Station(controller, wallet, account, config);
  };

  public disconnect = () => {
    this.controller.disconnect();
  };

  public onChange = (fn: (k: Station) => void) => {};

  public signAndBroadcast = async (
    msgs: EncodeObject[]
  ): Promise<DeliverTxResponse> => {
    const terraMsgs = msgs.map((m) =>
      Msg.fromProto({ typeUrl: m.typeUrl, value: registry.encode(m) })
    );

    const res = await this.controller.post(
      {
        msgs: terraMsgs,
        chainID: this.config.chainId,
      },
      this.account.address
    );
    console.log(res);

    //
    return res;
    // }
  };
}