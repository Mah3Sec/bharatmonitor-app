// api/submit.ts — Vercel Edge Function
// Creates a GitHub Issue as the free public ticket database
// Reporters need NO GitHub account — our server token creates issues on their behalf
// Set env vars: GITHUB_TOKEN, GITHUB_REPO (e.g. "yourusername/bharatmonitor-issues")
export const config = { runtime: 'edge' }

const rateMap = new Map<string,{count:number;resetAt:number}>()
function rateOk(ip:string,limit:number,ms:number):boolean{
  const now=Date.now(),e=rateMap.get(ip)
  if(!e||now>e.resetAt){rateMap.set(ip,{count:1,resetAt:now+ms});return true}
  if(e.count>=limit)return false;e.count++;return true
}

const CORS=['https://bharatmonitor.vercel.app','http://localhost:5173','http://localhost:3000']
function cors(o:string|null){const a=o&&CORS.includes(o)?o:CORS[0];return{'Access-Control-Allow-Origin':a,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}}

function san(s:string,n=500){return String(s??'').replace(/[<>"']/g,'').slice(0,n).trim()}

// Category → GitHub label colour
const LABEL_COLOURS:Record<string,string>={
  roads:'FF6B00',water:'00b8e6',power:'ffd700',health:'ff2244',
  corrupt:'00ddb8',education:'a855f7',transport:'38bdf8',
  safety:'f97316',environment:'22c55e',other:'64748b'
}

const SEV_COLOURS:Record<string,string>={emergency:'B60205',critical:'E4E669',high:'FF9F1C',medium:'0075CA',low:'CFD3D7'}

async function ensureLabels(repo:string,token:string,labels:string[],type:'cat'|'sev'){
  for(const label of labels){
    const colour = type==='cat' ? LABEL_COLOURS[label] : SEV_COLOURS[label]
    if(!colour)continue
    await fetch(`https://api.github.com/repos/${repo}/labels`,{
      method:'POST',
      headers:{'Authorization':`token ${token}`,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},
      body:JSON.stringify({name:label,color:colour,description:`BharatMonitor ${type}: ${label}`})
    }).catch(()=>{}) // ignore if label already exists
  }
}

export default async function handler(req:Request):Promise<Response>{
  const origin=req.headers.get('origin'),c=cors(origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:c})
  if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers:c})

  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'unknown'
  if(!rateOk(ip,5,600000)) // 5 submissions per IP per 10 min
    return new Response(JSON.stringify({error:'Too many reports. Wait 10 minutes.'}),{status:429,headers:{...c,'Content-Type':'application/json'}})

  let body:Record<string,string>
  try{body=await req.json()}catch{return new Response(JSON.stringify({error:'Bad JSON'}),{status:400,headers:{...c,'Content-Type':'application/json'}})}

  const cat      = san(body.category||'other',30)
  const state    = san(body.state||'India',60)
  const district = san(body.district||'',80)
  const title    = san(body.title||'',200)
  const desc     = san(body.desc||'',800)
  const name     = san(body.name||'Anonymous',80)
  const phone    = san(body.phone||'',15).replace(/[^0-9+\s-]/g,'')
  const severity = san(body.severity||'medium',20)
  const dept     = san(body.dept||'Relevant Authority',100)
  const mediaUrl = san(body.mediaUrl||'',500)
  const sla      = san(body.sla||'48',10)

  if(!title||title.length<5)return new Response(JSON.stringify({error:'Title too short'}),{status:400,headers:{...c,'Content-Type':'application/json'}})
  if(!desc||desc.length<10)return new Response(JSON.stringify({error:'Description too short'}),{status:400,headers:{...c,'Content-Type':'application/json'}})

  const ticket = 'BM-'+new Date().getFullYear().toString().slice(-2)+'-'+Math.floor(10000+Math.random()*90000)
  const token  = (typeof process!=='undefined'?process.env.GITHUB_TOKEN:undefined) as string|undefined
  const repo   = (typeof process!=='undefined'?process.env.GITHUB_REPO:undefined) as string|undefined

  // If no GitHub config — return local ticket (stored in browser only)
  if(!token||!repo){
    return new Response(JSON.stringify({ok:true,ticket,source:'local',severity,department:dept,sla_hours:parseInt(sla),message:'Registered locally. Set GITHUB_TOKEN + GITHUB_REPO in Vercel for cross-user tracking.'}),
      {headers:{...c,'Content-Type':'application/json'}})
  }

  // Build GitHub issue body
  const mediaSection = mediaUrl
    ? `\n### Evidence\n${/\.(jpg|jpeg|png|gif|webp)/i.test(mediaUrl)?`![Evidence](${mediaUrl})`:`🔗 ${mediaUrl}`}\n`
    : ''

  const ghBody = `## 🇮🇳 BharatMonitor Civic Issue Report

| Field | Value |
|-------|-------|
| **Ticket** | \`${ticket}\` |
| **Category** | ${cat} |
| **Severity** | ${severity} |
| **State** | ${state} |
| **District** | ${district||'—'} |
| **Department** | ${dept} |
| **SLA** | ${sla} hours |
| **Reporter** | ${name}${phone?` / ${phone}`:''} |
| **Submitted** | ${new Date().toISOString()} |

### Description
${desc}
${mediaSection}
---
*Submitted via [BharatMonitor](https://bharatmonitor.vercel.app) | Ticket: ${ticket}*`

  try{
    // Ensure labels exist (fire-and-forget)
    ensureLabels(repo,token,[cat],                     'cat')
    ensureLabels(repo,token,[severity],                'sev')
    ensureLabels(repo,token,[`state:${state.toLowerCase().replace(/\s+/g,'-')}`],'cat')

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`,{
      method:'POST',
      headers:{'Authorization':`token ${token}`,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},
      body:JSON.stringify({
        title:`[${cat.toUpperCase()}][${state}] ${title}`,
        body:ghBody,
        labels:[cat,severity,`state:${state.toLowerCase().replace(/\s+/g,'-')}`]
      })
    })

    const data = await res.json()
    if(!res.ok)throw new Error(data.message||`GitHub ${res.status}`)

    return new Response(JSON.stringify({
      ok:true, ticket,
      issueNumber: data.number,
      issueUrl: data.html_url,
      source:'github',
      severity, department:dept,
      sla_hours:parseInt(sla)||48,
      message:'Your issue has been registered and is publicly tracked on GitHub.'
    }),{headers:{...c,'Content-Type':'application/json'}})

  }catch(e){
    // GitHub failed — return local ticket anyway, don't break UX
    return new Response(JSON.stringify({
      ok:true, ticket, source:'local',
      severity, department:dept, sla_hours:parseInt(sla)||48,
      message:'Issue registered. GitHub tracking unavailable right now.',
      error:String(e)
    }),{headers:{...c,'Content-Type':'application/json'}})
  }
}
