import { json } from './_collector.js';
import { readBridgeSession } from './_bridge.js';
export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{ok:false,error:'Method not allowed'});
  const s=readBridgeSession(req);
  if(!s) return json(res,200,{ok:true,linked:false});
  return json(res,200,{ok:true,linked:true,join_id:s.join_id,run_mode:s.run_mode,recruitment_source:s.recruitment_source,assignment_id:s.assignment_id,worker_id:s.worker_id,hit_id:s.hit_id});
}
