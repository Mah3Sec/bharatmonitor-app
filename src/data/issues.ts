// api/issues.ts — Vercel Edge Function
// Fetches citizen reports from GitHub Issues
// Public repo — no auth needed to READ, only to write (submit.ts handles writes)
export const config = { runtime: 'edge' }

const CORS=['https://bharatmonitor.vercel.app','http://localhost:5173','http://localhost:3000']
function cors(o:string|null){const a=o&&CORS.includes(o)?o:CORS[0];return{'Access-Control-Allow-Origin':a}}

function extractField(body:string,field:string):string{
  const m=body.match(new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*([^|\\n]+)`))
  return m?m[1].trim().replace(/`/g,''):''
}

const CAT_MAP:Record<string,string>={roads:'roads',water:'water',power:'power',health:'health',corrupt:'corrupt',education:'education',transport:'transport',safety:'safety',environment:'environment',other:'other'}
const SEV_MAP:Record<string,string>={emergency:'emergency',critical:'critical',high:'high',medium:'medium',low:'low'}

export default async function handler(req:Request):Promise<Response>{
  const origin=req.headers.get('origin'),c=cors(origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:c})

  const repo=(typeof process!=='undefined'?process.env.GITHUB_REPO:undefined) as string|undefined
  const token=(typeof process!=='undefined'?process.env.GITHUB_TOKEN:undefined) as string|undefined

  if(!repo)return new Response(JSON.stringify({ok:true,issues:[]}),{headers:{...c,'Content-Type':'application/json'}})

  try{
    const url=`https://api.github.com/repos/${repo}/issues?state=open&per_page=50&sort=created&direction=desc`
    const headers:Record<string,string>={'Accept':'application/vnd.github.v3+json'}
    if(token)headers['Authorization']=`token ${token}`

    const res = await fetch(url,{headers,signal:AbortSignal.timeout(8000)})
    if(!res.ok)throw new Error(`GitHub ${res.status}`)
    const data:any[] = await res.json()

    const issues = data
      .filter((i:any)=>i.body&&i.title)
      .map((i:any)=>{
        const body=i.body||''
        const cat   = CAT_MAP[extractField(body,'Category').toLowerCase()] || 'other'
        const sev   = SEV_MAP[extractField(body,'Severity').toLowerCase()] || 'medium'
        const state = extractField(body,'State') || 'India'
        const dist  = extractField(body,'District')
        const dept  = extractField(body,'Department') || 'Relevant Authority'
        const ticket= extractField(body,'Ticket')
        const sla   = parseInt(extractField(body,'SLA'))||48
        // Strip [CAT][STATE] prefix from title
        const titleClean = i.title.replace(/^\[[^\]]+\]\[[^\]]+\]\s*/,'')
        // Extract description
        const descMatch = body.match(/### Description\n([\s\S]*?)(?:\n###|\n---)/)?.[1]?.trim()||''
        // Extract media URL
        const imgMatch = body.match(/!\[Evidence\]\(([^)]+)\)/)?.[1]
                      || body.match(/🔗 (https?:\/\/[^\s\n]+)/)?.[1]
                      || ''

        return{
          id:'gh-'+i.number,
          ghNumber:i.number,
          ghUrl:i.html_url,
          ticket: ticket||('BM-'+String(i.number).padStart(5,'0')),
          title:titleClean,
          state,district:dist,cat,sev,dept,
          ts:new Date(i.created_at).getTime(),
          src:'citizen',link:i.html_url,
          desc:descMatch,
          imageUrl:imgMatch,
          sla,
        }
      })

    return new Response(JSON.stringify({ok:true,issues}),{
      headers:{...c,'Content-Type':'application/json','Cache-Control':'public, max-age=60, stale-while-revalidate=30'}
    })
  }catch(e){
    return new Response(JSON.stringify({ok:false,issues:[],error:String(e)}),{
      headers:{...c,'Content-Type':'application/json'}
    })
  }
}
