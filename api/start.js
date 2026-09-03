import { collectorGet, collectorPost, persistBridgeStart, json } from './_collector.js';
import { deriveProductionJoinId, createRandomJoinId, signBridgeSession, serializeBridgeCookie } from './_bridge.js';

const qtext=(v,max=200)=>String(v??'').trim().slice(0,max);
function redirect(res,url){res.status(302);res.setHeader('Location',url);return res.end();}

export function makeStartHandler({collectorGetImpl=collectorGet,collectorPostImpl=collectorPost,secret=process.env.BRIDGE_SIGNING_SECRET}={}){
  return async function handler(req,res){
    if(req.method!=='GET') return json(res,405,{ok:false,error:'Method not allowed'});
    try{
      const assignmentId=qtext(req.query?.assignmentId);
      const workerId=qtext(req.query?.workerId);
      const hitId=qtext(req.query?.hitId);
      if(!assignmentId) return json(res,400,{ok:false,error:'Missing MTurk assignmentId. Internal testers should use /test.'});
      const preview=assignmentId==='ASSIGNMENT_ID_NOT_AVAILABLE';
      const session=preview?{
        join_id:createRandomJoinId('PREVIEW'),run_mode:'preview',recruitment_source:'mturk_preview',assignment_id:'',worker_id:workerId,hit_id:hitId
      }:{
        join_id:deriveProductionJoinId(assignmentId,secret),run_mode:'production',recruitment_source:'mturk',assignment_id:assignmentId,worker_id:workerId,hit_id:hitId
      };
      const cfg=await collectorGetImpl({action:'config'});
      const surveyUrl=String(cfg?.survey_url||'').trim();
      if(!/^https:\/\//i.test(surveyUrl)) return json(res,503,{ok:false,error:'Survey URL is not configured'});
      await persistBridgeStart(session,collectorPostImpl);
      const token=signBridgeSession(session,secret);
      res.setHeader('Set-Cookie',serializeBridgeCookie(token));
      return redirect(res,surveyUrl);
    }catch(error){
      console.error('bridge start failed',error);
      return json(res,503,{ok:false,error:'Study session could not be initialized'});
    }
  };
}
export default makeStartHandler();
