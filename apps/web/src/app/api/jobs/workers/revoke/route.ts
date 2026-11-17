import {NextResponse,type NextRequest} from "next/server";
import {createPublicClient,http,type Hex} from "viem";
import {base} from "viem/chains";
import {kv} from "@/lib/kv";
import {revokeMessage} from "../../../../../../../../packages/core/src/workers";
export async function POST(req:NextRequest) {
 try {const b=await req.json();if(!/^0x[0-9a-f]{40}$/i.test(b.owner||'')||!/^\d{1,12}$/.test(String(b.agentId))||!/^[0-9a-f]{32}$/.test(b.nonce||'')||!Number.isFinite(Date.parse(b.issuedAt))||Math.abs(Date.now()-Date.parse(b.issuedAt))>600000)return NextResponse.json({error:'Invalid revocation'},{status:400});
 const c=createPublicClient({chain:base,transport:http(process.env.BASE_RPC_URL||'https://mainnet.base.org')});
 if(!await c.verifyMessage({address:b.owner as Hex,message:revokeMessage(String(b.agentId),b.nonce,b.issuedAt),signature:b.signature}))return NextResponse.json({error:'Invalid signature'},{status:401});
 await kv.set(`worker:revoked:${b.owner.toLowerCase()}:${b.nonce}`,true,{ex:86400});return NextResponse.json({revoked:true});
 }catch{return NextResponse.json({error:'Revocation unavailable'},{status:503});}
}
