// api/rss.ts — Vercel Edge Function
// Proxy for RSS feeds + image extraction
// Added: news.google.com, reddit.com, hindustantimes.com, scroll.in
export const config = { runtime: 'edge' }

const ALLOWED_DOMAINS = new Set([
  // Google News (returns real-time results from all sources)
  'news.google.com',
  // Reddit (community civic reports)
  'www.reddit.com','reddit.com',
  // Indian national news
  'thehindu.com','ndtv.com','indianexpress.com','hindustantimes.com',
  'timesofindia.indiatimes.com','livemint.com','business-standard.com',
  'scroll.in','theprint.in','thewire.in','newslaundry.com',
  // Government feeds
  'pib.gov.in','pmindia.gov.in','nhai.gov.in','mohfw.gov.in',
  'jalshakti-dowr.gov.in','mygov.in',
  // Feedburner proxy
  'feeds.feedburner.com','feedburner.com',
])

const rateMap = new Map<string, {count:number;resetAt:number}>()
function rateOk(ip:string,limit:number,ms:number):boolean{
  const now=Date.now(),e=rateMap.get(ip)
  if(!e||now>e.resetAt){rateMap.set(ip,{count:1,resetAt:now+ms});return true}
  if(e.count>=limit)return false;e.count++;return true
}

const circuit = new Map<string,{fail:number;openUntil:number}>()
function circuitOpen(d:string):boolean{const c=circuit.get(d);if(!c)return false;if(Date.now()<c.openUntil)return true;circuit.delete(d);return false}
function fail(d:string){const c=circuit.get(d)??{fail:0,openUntil:0};c.fail++;if(c.fail>=3)c.openUntil=Date.now()+300000;circuit.set(d,c)}
function ok(d:string){circuit.delete(d)}

function safe(s:string,n=500):string{return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').trim().slice(0,n)}

function parseRSS(xml:string) {
  const items:any[]=[]
  const blocks = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g)]

  for(const m of blocks){
    const b=m[1]
    const get=(tag:string)=>{
      const cd=b.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
      if(cd)return cd[1].trim()
      const pl=b.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`))
      return pl?pl[1].trim():''
    }
    // Link extraction
    const lk = b.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/)?.[1]?.trim()
            || b.match(/<link>([^<]*)<\/link>/)?.[1]?.trim()
            || b.match(/<feedburner:origLink>([^<]*)<\/feedburner:origLink>/)?.[1]?.trim()
            || ''
    // Image extraction: media:content, media:thumbnail, enclosure, og in description
    const imgSrc = b.match(/media:content[^>]+url="([^"]+)"[^>]+medium="image"/)?.[1]
                || b.match(/media:thumbnail[^>]+url="([^"]+)"/)?.[1]
                || b.match(/enclosure[^>]+url="([^"]+)"[^>]+type="image/)?.[1]
                || b.match(/<img[^>]+src="([^"]+)"/)?.[1]
                || ''
    // Strip HTML from description
    const rawDesc = get('description').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ')

    const item = {
      title: safe(get('title'),200),
      link: safe(lk,500),
      pubDate: safe(get('pubDate'),100),
      description: safe(rawDesc,400),
      guid: safe(get('guid'),300),
      imageUrl: imgSrc ? safe(imgSrc,500) : '',
      source: safe(get('source')||get('dc:creator')||'',100),
    }
    if(item.title&&item.title.length>10) items.push(item)
    if(items.length>=25)break
  }
  return items
}

function allowedUrl(url:string):{ok:boolean;domain:string}{
  try{
    const h=new URL(url).hostname.replace(/^www\./,'')
    const ok2=ALLOWED_DOMAINS.has(h)||ALLOWED_DOMAINS.has('www.'+h)||[...ALLOWED_DOMAINS].some(d=>h.endsWith('.'+d))
    return{ok:ok2,domain:h}
  }catch{return{ok:false,domain:''}}
}

const CORS=['https://bharatmonitor.vercel.app','http://localhost:5173','http://localhost:3000']
function cors(o:string|null){const a=o&&CORS.includes(o)?o:CORS[0];return{'Access-Control-Allow-Origin':a}}

export default async function handler(req:Request):Promise<Response>{
  const origin=req.headers.get('origin'),c=cors(origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:c})
  const feedUrl=new URL(req.url).searchParams.get('url')
  if(!feedUrl)return new Response(JSON.stringify({ok:false,error:'Missing url'}),{status:400,headers:{...c,'Content-Type':'application/json'}})
  const{ok:allowed,domain}=allowedUrl(feedUrl)
  if(!allowed)return new Response(JSON.stringify({ok:false,error:'Domain not allowed: '+domain}),{status:403,headers:{...c,'Content-Type':'application/json'}})
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'unknown'
  if(!rateOk(ip,120,3600000))return new Response(JSON.stringify({ok:false,error:'Rate limit'}),{status:429,headers:{...c,'Content-Type':'application/json'}})
  if(circuitOpen(domain))return new Response(JSON.stringify({ok:false,error:'Circuit open'}),{status:503,headers:{...c,'Content-Type':'application/json'}})
  try{
    const res=await fetch(feedUrl,{
      headers:{'User-Agent':'Mozilla/5.0 BharatMonitor/2.0 (+https://bharatmonitor.vercel.app)','Accept':'application/rss+xml,application/xml,text/xml,*/*'},
      signal:AbortSignal.timeout(9000)
    })
    if(!res.ok){fail(domain);return new Response(JSON.stringify({ok:false,error:`Feed ${res.status}`}),{status:502,headers:{...c,'Content-Type':'application/json'}})}
    const xml=await res.text()
    const items=parseRSS(xml)
    ok(domain)
    return new Response(JSON.stringify({ok:true,items,fetchedAt:new Date().toISOString()}),{
      headers:{...c,'Content-Type':'application/json','Cache-Control':'public, max-age=180, stale-while-revalidate=60'}
    })
  }catch(e){fail(domain);return new Response(JSON.stringify({ok:false,error:String(e)}),{status:502,headers:{...c,'Content-Type':'application/json'}})}
}
