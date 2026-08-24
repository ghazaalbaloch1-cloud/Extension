export class WordPressClient {
  constructor({baseUrl,username,applicationPassword}) {
    this.baseUrl=baseUrl.replace(/\/$/,'');
    this.auth='Basic '+btoa(`${username}:${applicationPassword}`);
  }
  async request(path,options={}){
    const res=await fetch(this.baseUrl+'/wp-json/wp/v2/'+path,{...options,headers:{'Content-Type':'application/json','Authorization':this.auth,...(options.headers||{})}});
    const text=await res.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}};
    if(!res.ok) throw new Error(data.message||`WordPress API ${res.status}`);
    return data;
  }
  async test(){return this.request('users/me?context=edit')}
  async categories(){return this.request('categories?per_page=100&_fields=id,name,slug')}
  async createPost({title,content,status='draft',slug='',excerpt='',categories=[],featured_media=0}){
    return this.request('posts',{method:'POST',body:JSON.stringify({title,content,status,slug,excerpt,categories,featured_media})});
  }
  async updatePost(id,payload){return this.request(`posts/${id}`,{method:'POST',body:JSON.stringify(payload)})}
}
