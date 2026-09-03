import { collectorGet, collectorPost, persistBridgeStart, json } from './_collector.js';
import { createRandomJoinId, signBridgeSession, serializeBridgeCookie, deriveInternalTestToken } from './_bridge.js';

function redirect(res,url){res.status(302);res.setHeader('Location',url);return res.end();}
export function makeTestHandler({collectorGetImpl=collectorGet,collectorPostImpl=collectorPost,secret=process.env.BRIDGE_SIGNING_SECRET,internalToken=process.env.INTERNAL_TEST_TOKEN}={}){
  return async function handler(req,res){
    if(req.method!=='GET') return json(res,405,{ok:false,error:'Method not allowed'});
    const access=String(req.query?.access||'');
    const expectedToken=String(internalToken||deriveInternalTestToken(secret));
    if(!access || access!==expectedToken) return json(res,403,{ok:false,error:'Invalid internal test access'});
    try{
      const session={join_id:createRandomJoinId('TEST'),run_mode:'internal',recruitment_source:'internal_test',assignment_id:'',worker_id:'',hit_id:''};
      const cfg=await collectorGetImpl({action:'config'});
      const surveyUrl=String(cfg?.survey_url||'').trim();
      if(!/^https:\/\//i.test(surveyUrl)) return json(res,503,{ok:false,error:'Survey URL is not configured'});
      await persistBridgeStart(session,collectorPostImpl);
      const token=signBridgeSession(session,secret);
      res.setHeader('Set-Cookie',serializeBridgeCookie(token));
      return redirect(res,surveyUrl);
    }catch(error){
      console.error('internal bridge start failed',error);
      return json(res,503,{ok:false,error:'Internal test session could not be initialized'});
    }
  };
}
export default makeTestHandler();
