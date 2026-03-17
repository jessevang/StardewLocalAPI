
export class ApiClient {
  constructor(){
    this.baseUrl = "";
    this.token = "";
    this.timeoutMs = 6000;
  }

  configure({ baseUrl, token }){
    this.baseUrl = (baseUrl || "").trim().replace(/\/+$/,"");
    this.token = (token || "").trim();
  }

  get isConfigured(){
    return !!this.baseUrl;
  }

  async request(path, { method="GET", body=null, headers={} } = {}){
    if(!this.baseUrl) throw new Error("Missing baseUrl");

    const url = new URL(path, this.baseUrl);
    if(this.token) url.searchParams.set("token", this.token);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);

    try{
      const res = await fetch(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Devtools-Token": this.token || "",
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const text = await res.text();
      let json = null;
      try{ json = text ? JSON.parse(text) : null; }
      catch{ json = { ok: false, raw: text }; }

      return { ok: res.ok, status: res.status, json };
    } finally {
      clearTimeout(t);
    }
  }

  get(path){ return this.request(path, { method: "GET" }); }
  post(path, body){ return this.request(path, { method: "POST", body }); }
}
