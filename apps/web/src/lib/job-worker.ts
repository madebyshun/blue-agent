import { createPublicClient,http, type Hex } from "viem";
import {base} from "viem/chains";
import {kv} from "@/lib/kv";
import {ownsAgent} from "@/lib/erc8004";
import {grantProblem,workerGrantMessage,workerJobContract,type WorkerGrant} from "../../../../packages/core/src/workers";
export {workerGrantMessage,workerJobContract};
const client=createPublicClient({chain:base,transport:http(process.env.BASE_RPC_URL || "https://mainnet.base.org")});
export type SignedGrant = WorkerGrant & {signature:Hex};
export async function validateWorkerGrant(g: SignedGrant, signer: string, job: {title:string;brief:string}) {
  if (!g || grantProblem(g) || g.delegate.toLowerCase()!==signer.toLowerCase() || workerJobContract(job).skill!==g.skill) return false;
  if (await kv.get(`worker:revoked:${g.owner.toLowerCase()}:${g.nonce}`)) return false;
  if (!await ownsAgent(g.owner,g.agentId)) return false;
  return client.verifyMessage({address:g.owner as Hex,message:workerGrantMessage(g),signature:g.signature}).catch(()=>false);
}
const local = new Map<string, unknown>();
async function atomic(script: string, key: string, args: string[], fallback: () => number) {
 const url=process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,token=process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
 if(!url||!token) { if(process.env.VERCEL) throw new Error("Worker storage unavailable"); return fallback(); }
 const r=await fetch(url,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(["EVAL",script,"1",key,...args])});
 const body=await r.json(); if(!r.ok||body.error)throw new Error("Worker storage unavailable");return Number(body.result);
}
export async function consumeGrant(g: SignedGrant, jobId:string) {
 const key=`worker:used:${g.owner.toLowerCase()}:${g.nonce}`;
 return (await atomic("if redis.call('SISMEMBER',KEYS[1],ARGV[1])==1 or redis.call('SCARD',KEYS[1])>=tonumber(ARGV[2]) then return 0 end redis.call('SADD',KEYS[1],ARGV[1]); redis.call('EXPIRE',KEYS[1],86400); return 1",key,[jobId,String(g.maxDeliveries)],()=>{const ids=(local.get(key) as string[])||[];if(ids.includes(jobId)||ids.length>=g.maxDeliveries)return 0;local.set(key,[...ids,jobId]);return 1;}))===1;
}
export async function reserveJob(jobId:string,owner:string,agentId:string) {
 const key=`worker:reservation:${jobId}`,value={owner:owner.toLowerCase(),agentId,expiresAt:Date.now()+15*60000};
 const ok=await atomic("local old=redis.call('GET',KEYS[1]); if old then local r=cjson.decode(old); if r.owner~=ARGV[1] and r.expiresAt>tonumber(ARGV[2]) then return 0 end end redis.call('SET',KEYS[1],ARGV[3],'EX',900); return 1",key,[value.owner,String(Date.now()),JSON.stringify(value)],()=>{const old=local.get(key) as typeof value|undefined;if(old&&old.expiresAt>Date.now()&&old.owner!==value.owner)return 0;local.set(key,value);return 1;});
 if(ok===1&&!process.env.KV_REST_API_URL&&!process.env.UPSTASH_REDIS_REST_URL)await kv.set(key,value,{ex:900});
 return ok===1;
}
export async function reservationAllows(jobId:string,owner:string) {
 const r=await kv.get<{owner:string;expiresAt:number}>(`worker:reservation:${jobId}`);
 return !r || r.expiresAt<=Date.now() || r.owner===owner.toLowerCase();
}
