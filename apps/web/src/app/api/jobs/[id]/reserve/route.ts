import {NextResponse,type NextRequest} from "next/server";
import {createPublicClient,http,type Hex} from "viem";
import {base} from "viem/chains";
import {getJob} from "@/lib/jobs";
import {ownsAgent} from "@/lib/erc8004";
import {validateWorkerGrant,reserveJob} from "@/lib/job-worker";
import {reservationMessage} from "../../../../../../../../packages/core/src/workers";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try {
  const {id}=await params,b=await req.json(),job=await getJob(id);
  if(!job||job.status!=='open')return NextResponse.json({error:'No open job'},{status:404});
  if(!/^0x[0-9a-f]{40}$/i.test(b.signer||'')||!/^\d{1,12}$/.test(String(b.agentId))||!Number.isFinite(Date.parse(b.issuedAt))||Math.abs(Date.now()-Date.parse(b.issuedAt))>600000)return NextResponse.json({error:'Invalid reservation'},{status:400});
  const c=createPublicClient({chain:base,transport:http(process.env.BASE_RPC_URL||'https://mainnet.base.org')});
  if(!await c.verifyMessage({address:b.signer as Hex,message:reservationMessage(id,String(b.agentId),b.issuedAt),signature:b.signature}))return NextResponse.json({error:'Invalid signature'},{status:401});
  const owner=b.workerGrant?.owner || b.signer;
  if(b.workerGrant ? b.workerGrant.agentId!==String(b.agentId)||!await validateWorkerGrant(b.workerGrant,b.signer,job) : !await ownsAgent(owner,String(b.agentId)))return NextResponse.json({error:'Identity or delegation refused'},{status:403});
  if(job.deliveries.some(d=>d.agent===owner.toLowerCase()))return NextResponse.json({error:'Already delivered'},{status:409});
  const ok=await reserveJob(id,owner,String(b.agentId));return NextResponse.json(ok?{reserved:true,leaseSeconds:900}:{error:'Another worker reserved this job'},{status:ok?200:409});
 }catch{return NextResponse.json({error:'Reservation unavailable'},{status:503});}
}
