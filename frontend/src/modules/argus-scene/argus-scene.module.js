/*!
 * Argus Cyclist — 3D scene (rider + "Litoral Potiguar" coastal environment)
 * Pure WebGL 2, no dependencies. Works offline.
 *
 * Usage:
 *   const scene = createArgusScene(containerElement, { camera: 'chase' });
 *   scene.setRideData({ power: 245, cadence: 88, speedKmh: 32.4 }); // real Argus data
 *   scene.setSprint(true|false|null);  // null = automatic from power
 *   scene.dispose();                   // when leaving the screen
 *
 * Options (all optional):
 *   camera: 'chase' | 'drone' | 'cinematic'   (default 'chase')
 *   timeOfDay: 0..1   (0 = 5 am, ~0.13 = morning, 0.6 = sunset, 0.8 = night)   default 0.13
 *   dayCycleSeconds: length of a full day in seconds; 0 freezes the time of day   default 120
 *   ftp: rider FTP in W (used by the automatic sprint)   default 250
 *   autoSprintFromPower: sprints when power > ~1.35–1.65 × FTP   default true
 *   riderMass: rider + bike mass (kg) for the internal physics   default 78
 *   interactive: holding the canvas triggers a manual sprint   default false
 *   keyboard: Space = sprint, C = switch camera   default false
 *   demo: automatic demo sprints while idle   default false
 *   petals: petals during the sprint   default true
 *   maxPixelRatio: devicePixelRatio cap   default 1.75
 *   renderScale: [Argus app] scale over devicePixelRatio (supersampling above 1)   default 1
 *   logoUrl: URL/data URI of a PNG mask (alpha) for the back logo   default: embedded Argus logo
 *   autoStart: starts the animation loop on creation   default true
 *
 * Sections marked [Argus app] are the app's extensions to the scene as delivered (course
 * distance sync, record ghost, race gates, stopped pose, frame capture, render scale).
 */
export function createArgusScene(container,options){
"use strict";
  const CAM_IDS=['chase','drone','cinematic'];
  const OPT=Object.assign({camera:'chase',timeOfDay:0.13,dayCycleSeconds:120,ftp:250,autoSprintFromPower:true,riderMass:78,interactive:false,keyboard:false,demo:false,petals:true,maxPixelRatio:1.75,renderScale:1,logoUrl:null,autoStart:true},options||{});

// ================= utilities
const clamp=(x,a,b)=>x<a?a:x>b?b:x, lerp=(a,b,t)=>a+(b-a)*t, TAU=Math.PI*2;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const hash=(i,s)=>{const x=Math.sin(i*127.1+s*311.7+s*s*0.137)*43758.5453;return x-Math.floor(x);};
const cc=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
const mix3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return[a[0]/l,a[1]/l,a[2]/l];};
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;const h=(a,b)=>hash(a*57+b*131,1.7);const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);return lerp(lerp(h(xi,yi),h(xi+1,yi),u),lerp(h(xi,yi+1),h(xi+1,yi+1),u),v);}
const reduced=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

// ================= mat4 (column-major)
const M4={
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},
  persp(f,as,n,fa){const t=1/Math.tan(f/2),m=new Float32Array(16);m[0]=t/as;m[5]=t;m[10]=(fa+n)/(n-fa);m[11]=-1;m[14]=2*fa*n/(n-fa);return m;},
  look(e,c,u){const z=norm(sub(e,c)),x=norm(cross(u,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1]);},
  basis(x,y,z,p){return new Float32Array([x[0],x[1],x[2],0,y[0],y[1],y[2],0,z[0],z[1],z[2],0,p[0],p[1],p[2],1]);},
  T(x,y,z){const m=M4.basis([1,0,0],[0,1,0],[0,0,1],[x,y,z]);return m;},
  S(x,y,z){return M4.basis([x,0,0],[0,y,0],[0,0,z],[0,0,0]);},
  RZ(a){const c=Math.cos(a),s=Math.sin(a);return M4.basis([c,s,0],[-s,c,0],[0,0,1],[0,0,0]);},
  RY(a){const c=Math.cos(a),s=Math.sin(a);return M4.basis([c,0,-s],[0,1,0],[s,0,c],[0,0,0]);},
  ap(m,v){const w=m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15];return[(m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12])/w,(m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13])/w,(m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14])/w,w];},
  ortho(l,r,b,t,n,f){const m=new Float32Array(16);m[0]=2/(r-l);m[5]=2/(t-b);m[10]=-2/(f-n);m[12]=-(r+l)/(r-l);m[13]=-(t+b)/(t-b);m[14]=-(f+n)/(f-n);m[15]=1;return m;},
  inv(m){const a=m,o=new Float32Array(16);
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    let d=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;if(!d)return o;d=1/d;
    o[0]=(a11*b11-a12*b10+a13*b09)*d;o[1]=(a02*b10-a01*b11-a03*b09)*d;o[2]=(a31*b05-a32*b04+a33*b03)*d;o[3]=(a22*b04-a21*b05-a23*b03)*d;
    o[4]=(a12*b08-a10*b11-a13*b07)*d;o[5]=(a00*b11-a02*b08+a03*b07)*d;o[6]=(a32*b02-a30*b05-a33*b01)*d;o[7]=(a20*b05-a22*b02+a23*b01)*d;
    o[8]=(a10*b10-a11*b08+a13*b06)*d;o[9]=(a01*b08-a00*b10-a03*b06)*d;o[10]=(a30*b04-a31*b02+a33*b00)*d;o[11]=(a21*b02-a20*b04-a23*b00)*d;
    o[12]=(a11*b07-a10*b09-a12*b06)*d;o[13]=(a00*b09-a01*b07+a02*b06)*d;o[14]=(a31*b01-a30*b03-a32*b00)*d;o[15]=(a20*b03-a21*b01+a22*b00)*d;return o;}
};
const ID=M4.T(0,0,0);

// ================= WebGL
if(getComputedStyle(container).position==='static')container.style.position='relative';
const cv=document.createElement('canvas'),ov=document.createElement('canvas');
for(const c of[cv,ov]){c.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';container.appendChild(c);}
ov.style.pointerEvents='none';cv.style.touchAction='none';
const gl=cv.getContext('webgl2',{antialias:true,powerPreference:'high-performance'});
if(!gl){cv.remove();ov.remove();throw new Error('ArgusScene: este navegador/dispositivo não suporta WebGL 2.');}
const oc=ov.getContext('2d');

const VS=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;layout(location=2) in vec3 aDry;layout(location=3) in vec3 aWet;layout(location=4) in vec4 aMeta;layout(location=5) in vec3 aAnc;
uniform mat4 uVP,uModel;uniform float uTime;uniform sampler2D uBloom;uniform float uTintOn;uniform vec3 uTint;
out vec3 vCol;out vec3 vNor;out vec3 vW;out float vKind;
float bloomAt(float s){int i=int(mod(floor(s),4096.));vec2 r=texelFetch(uBloom,ivec2(i,0),0).rg;if(r.x<0.)return .05;float g=clamp((uTime-r.y)/.9,0.,1.);g=1.-pow(1.-g,3.);return mix(.05,r.x,g);}
void main(){
  vec3 p=aPos;float b=0.;
  if(uTintOn<.5){b=.82+.18*fract(sin(aMeta.x*12.9898)*437.585);
    if(aMeta.y>.5&&aMeta.y<1.5){p=aAnc+(aPos-aAnc)*smoothstep(.42,.8,b);}
    else if(aMeta.y>1.5){p=aAnc+(aPos-aAnc)*mix(.3,1.,smoothstep(0.,.6,b));}
    if(aMeta.z>1.5&&aMeta.z<2.5)p.y+=sin(uTime*1.4+aMeta.x*.37)*.18;
    vCol=mix(aDry,aWet,clamp(b*aMeta.w*1.25,0.,1.));
  }else vCol=uTint;
  vec4 w=uModel*vec4(p,1.);vW=w.xyz;vNor=transpose(inverse(mat3(uModel)))*aNor;vKind=uTintOn<.5?aMeta.z:0.;
  gl_Position=uVP*w;}`;
const FS=`#version 300 es
precision highp float;
in vec3 vCol;in vec3 vNor;in vec3 vW;in float vKind;
uniform highp sampler2DShadow uShadow;uniform mat4 uShadowVP;uniform float uShadowOn;
float shadowAt(vec3 w){if(uShadowOn<.5)return 1.;vec4 p=uShadowVP*vec4(w,1.);vec3 q=p.xyz/p.w*.5+.5;if(any(lessThan(q,vec3(0.)))||any(greaterThan(q,vec3(1.))))return 1.;float s=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)s+=texture(uShadow,vec3(q.xy+vec2(float(x),float(y))/1300.,q.z-.0015));return s/9.;}
uniform vec3 uSunDir,uSunCol,uSkyAmb,uGndAmb,uFog,uCam,uLampPos,uLampDir;uniform float uFogDen,uLamp,uNight,uTime,uEmis,uAlpha,uSpec;
out vec4 o;
void main(){
  if(uEmis>.5){vec3 c=vCol;float d=length(uCam-vW);c=mix(c,uFog,clamp(1.-exp(-pow(d*uFogDen,1.6)),0.,1.)*.6);o=vec4(c,uAlpha);return;}
  vec3 n=normalize(vNor);if(!gl_FrontFacing)n=-n;
  vec3 V=normalize(uCam-vW);
  if(vKind>.5&&vKind<1.5){n=normalize(vec3(sin(vW.x*.21+uTime*1.1)*.05+sin(vW.z*.37-uTime*.9)*.04,1.,cos(vW.z*.18+uTime*1.3)*.06));}
  float dif=max(dot(n,uSunDir),0.)*shadowAt(vW+n*.02);
  vec3 amb=mix(uGndAmb,uSkyAmb,n.y*.5+.5);
  vec3 c=vCol*(amb+uSunCol*dif);
  if(vKind>.5&&vKind<1.5){vec3 h=normalize(uSunDir+V);c+=uSunCol*pow(max(dot(n,h),0.),90.)*1.6;float fr=pow(1.-max(dot(n,V),0.),4.);c=mix(c,uFog,fr*.55);}
  if(uSpec>0.){vec3 h=normalize(uSunDir+V);c+=uSunCol*pow(max(dot(n,h),0.),48.)*uSpec*.6;c+=(uSkyAmb*.9+uSunCol*.15)*pow(1.-max(dot(n,V),0.),3.)*uSpec*.7;}
  if(vKind>2.5){c=mix(c,vec3(1.,.82,.45)*1.4,uNight);}
  if(uLamp>.01){vec3 L=uLampPos-vW;float d=length(L);L/=d;float cone=smoothstep(.86,.97,dot(-L,uLampDir));c+=vCol*vec3(1.,.93,.78)*cone*uLamp*max(dot(n,L),0.)*28./(1.+d*d*.12);}
  float d=length(uCam-vW);c=mix(c,uFog,clamp(1.-exp(-pow(d*uFogDen,1.6)),0.,1.));
  o=vec4(c,uAlpha);}`;
const SVS=`#version 300 es
out vec2 vP;void main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);vP=p;gl_Position=vec4(p,.99999,1.);}`;
const SFS=`#version 300 es
precision highp float;in vec2 vP;
uniform mat4 uInv;uniform vec3 uCam,uTop,uMid,uHor,uSunDir,uSunC,uMoonDir;uniform float uNight,uTime,uSunVis,uMoonVis;
out vec4 o;
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec4 w=uInv*vec4(vP,1.,1.);vec3 d=normalize(w.xyz/w.w-uCam);float h=d.y;
  vec3 c=mix(uHor,uMid,smoothstep(0.,.28,h));c=mix(c,uTop,smoothstep(.25,.95,h));
  if(h<0.)c=uHor;
  float sd=dot(d,uSunDir);
  c+=uSunC*(pow(max(sd,0.),6.)*.35+pow(max(sd,0.),64.)*.6)*uSunVis;
  c=mix(c,vec3(1.,.97,.86)+uSunC*.2,smoothstep(.9990,.9995,sd)*uSunVis);
  float md=dot(d,uMoonDir);c+=vec3(.6,.7,.9)*pow(max(md,0.),40.)*.25*uMoonVis;c=mix(c,vec3(.95,.94,.88),smoothstep(.99955,.9998,md)*uMoonVis);
  if(uNight>.01&&h>0.){vec3 q=floor(d*260.);float r=fract(sin(dot(q,vec3(12.9898,78.233,37.719)))*43758.5453);float tw=.6+.4*sin(uTime*3.+r*60.);c+=vec3(1.,1.,.94)*step(.9982,r)*uNight*smoothstep(0.,.12,h)*tw;}
  if(h>.02){vec2 uv=d.xz/(d.y+.12)*1.6+vec2(uTime*.012,-uTime*.004);float cl=n2(uv*1.3)*.6+n2(uv*3.1)*.3+n2(uv*7.)*.1;cl=smoothstep(.55,.8,cl)*smoothstep(.02,.2,h);
    vec3 ccol=mix(vec3(1.),uSunC*1.1+vec3(.3),.25);ccol=mix(ccol,uMid*.6+vec3(.08,.08,.14),uNight);c=mix(c,ccol,cl*.85);}
  o=vec4(c,1.);}`;
const PBVS=`#version 300 es
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;layout(location=2) in vec3 aCol;layout(location=3) in vec3 aMat;layout(location=4) in vec2 aUV;
uniform mat4 uVP,uModel;uniform vec3 uTint,uMatU;uniform float uUseV;
out vec3 vN;out vec3 vW;out vec3 vCol;out vec3 vMat;out vec2 vUV;
void main(){vec4 w=uModel*vec4(aPos,1.);vW=w.xyz;vN=transpose(inverse(mat3(uModel)))*aNor;vCol=uUseV>.5?aCol:aCol*uTint;vMat=uUseV>.5?aMat:uMatU;vUV=uUseV>.5?aUV:vec2(-1.);gl_Position=uVP*w;}`;
const PBFS=`#version 300 es
precision highp float;
in vec3 vN;in vec3 vW;in vec3 vCol;in vec3 vMat;in vec2 vUV;
uniform sampler2D uLogo;uniform float uLogoOn;uniform float uGhost;uniform vec3 uGhostCol;
uniform vec3 uSunDir,uSunCol,uSkyAmb,uGndAmb,uFog,uCam,uLampPos,uLampDir;uniform float uFogDen,uLamp,uEmis,uAlpha;
uniform highp sampler2DShadow uShadow;uniform mat4 uShadowVP;uniform float uShadowOn;
float shadowAt(vec3 w){if(uShadowOn<.5)return 1.;vec4 p=uShadowVP*vec4(w,1.);vec3 q=p.xyz/p.w*.5+.5;if(any(lessThan(q,vec3(0.)))||any(greaterThan(q,vec3(1.))))return 1.;float s=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)s+=texture(uShadow,vec3(q.xy+vec2(float(x),float(y))/1300.,q.z-.0015));return s/9.;}
out vec4 o;
void main(){
  vec3 alb=vCol;
  if(uLogoOn>.5&&vUV.x>0.){float dt=vUV.y-3.14159,ls=.5+dt/1.9,lt=1.-(vUV.x-.44)/.33;if(ls>0.&&ls<1.&&lt>0.&&lt<1.)alb=mix(alb,vec3(.06,.1,.27),texture(uLogo,vec2(ls,lt)).a);}
  if(uEmis>.5||vMat.z>2.5){vec3 c=alb;float d=length(uCam-vW);c=mix(c,uFog,clamp(1.-exp(-pow(d*uFogDen,1.6)),0.,1.)*.6);o=vec4(c,uAlpha);return;}
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;vec3 V=normalize(uCam-vW),L=uSunDir,H=normalize(L+V);
  float rough=clamp(vMat.x,.05,1.),metal=vMat.y,a=rough*rough,a2=a*a;
  float NLr=dot(N,L),NL=max(NLr,0.),NV=max(dot(N,V),.001),NH=max(dot(N,H),0.),VH=max(dot(V,H),0.);
  float sh=shadowAt(vW+N*.012);
  vec3 F0=mix(vec3(.04),alb,metal),F=F0+(1.-F0)*pow(1.-VH,5.);
  float dn=NH*NH*(a2-1.)+1.,D=a2/(3.14159*dn*dn),k=(rough+1.)*(rough+1.)/8.,G=NV/(NV*(1.-k)+k)*NL/(NL*(1.-k)+k);
  vec3 spec=D*G*F/(4.*NV*max(NL,.001)+1e-4);
  bool skin=vMat.z>.5&&vMat.z<1.5,cloth=vMat.z>1.5&&vMat.z<2.5;
  float w=skin?.4:(cloth?.15:0.),NLd=max((NLr+w)/(1.+w),0.);
  vec3 kd=(1.-F)*(1.-metal);
  vec3 c=(kd*alb*NLd+spec*NL*3.14159*(cloth?.45:1.))*uSunCol*sh;
  if(skin)c+=alb*vec3(.35,.08,.04)*smoothstep(-.4,.2,NLr)*(1.-NL)*.5*uSunCol*sh;
  vec3 amb=mix(uGndAmb,uSkyAmb,N.y*.5+.5);float ao=.72+.28*clamp(N.y*.5+.5,0.,1.);
  c+=alb*kd*amb*ao;
  vec3 R=reflect(-V,N),env=mix(uGndAmb,uSkyAmb*1.2,smoothstep(-.2,.4,R.y));
  c+=env*F*(1.-rough*.85)*(metal>.5?1.:.6);
  if(cloth)c+=alb*pow(1.-NV,3.)*.3*(uSkyAmb+uSunCol*.25*sh);
  if(uLamp>.01){vec3 Lp=uLampPos-vW;float d=length(Lp);Lp/=d;float cone=smoothstep(.86,.97,dot(-Lp,uLampDir));c+=alb*vec3(1.,.93,.78)*cone*uLamp*max(dot(N,Lp),0.)*28./(1.+d*d*.12);}
  if(uGhost>.5){float lum=dot(c,vec3(.3,.59,.11)),fr=pow(1.-NV,2.5);c=uGhostCol*(.3+lum*1.15)+uGhostCol*fr*.9+vec3(fr*.2);}
  float d=length(uCam-vW);c=mix(c,uFog,clamp(1.-exp(-pow(d*uFogDen,1.6)),0.,1.));
  o=vec4(c,uAlpha);}`;
const DVS=`#version 300 es
layout(location=0) in vec3 aPos;uniform mat4 uLVP,uModel;void main(){gl_Position=uLVP*uModel*vec4(aPos,1.);}`;
const DFS=`#version 300 es
precision mediump float;void main(){}`;
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function prog(v,f){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,v));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
const P=prog(VS,FS),SP=prog(SVS,SFS),PB=prog(PBVS,PBFS),DP=prog(DVS,DFS);
const PU={},DU={uLVP:gl.getUniformLocation(DP,'uLVP'),uModel:gl.getUniformLocation(DP,'uModel')};
['uVP','uModel','uTint','uMatU','uUseV','uSunDir','uSunCol','uSkyAmb','uGndAmb','uFog','uCam','uLampPos','uLampDir','uFogDen','uLamp','uEmis','uAlpha','uShadow','uShadowVP','uShadowOn','uLogo','uLogoOn','uGhost','uGhostCol'].forEach(n=>PU[n]=gl.getUniformLocation(PB,n));
const logoTex=gl.createTexture();let logoOn=0;gl.bindTexture(gl.TEXTURE_2D,logoTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
{const li=new Image();li.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,logoTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,li);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);logoOn=1;};li.src=OPT.logoUrl||'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAwVUlEQVR42u2dd7gUVdLGf5cgooiyoiAY0TWgiIpiXkUxYETMCXPOWfdzzWlNi3FdBcOuAXNkjYgJRV0RxYiKoCIrKopEgUt/f9RhGe7tPn1Opwm33ueZB+5Mp+k5p7pO1Vtv1QVBgEKhaJpoprdAoVADoFAo1AAoFAo1AAqFQg2AQqFQA6BQKNQAKBQKNQAKhUINgEKhUAOgUCjUACgUCjUACoVCDYBCoagOtNBboMgZXYGewDrm9UfgD0BbywPoR2AM8DYwEnjBvKfIGHVaDqzIGOsCuwM7AxtneNwAeAa4B3jM/K1QA6CogGXkTsBRwG4FnncIcIHxEBRqABQFY2/gBGCrMl/Hl8DpwNP6k6gBUOSLJYBLgVMyOt4kYC5QBzQHWgJtzL+++ALYExitP5MaAEW26ADcAOzrud8U4D/AcOBZ4AfgJ2Aq8cHpTsCKZlJvY2ILLhgEHKk/mRoARTa4H9jfY/t/Aw8DQ4FvyTZjtQdwOLBjzLazgR7AR/rzqQFQJMfXwMox28wE7gIeAN4o6LraAMcCV5mlQxSOAgbqz6gGQOGPY4DbLJ8/BFwEfJryqd5q/lgE6s3Tu97jGEcD/7B8fimSLVCoAVB44K/A2RGfrQZ85XGsnsC2QHeEDLR2zPYzgBHAW8CLwKsO57gXODDis+uBM/QnRanACmf8DXvq7VyPY80Bfgd+A74BPgHmWbZfDAn8/R/wCkL6eRjoZtnnIGD7iM9ON56AQj0AhSfOAS6LoI2PBDYxEzzpA6gzsCGwj/l3tZh93gKOAz6I+Lwt8D2weMhn+wOD9SdVA6Dwx8HGlW4f8lk3sou41wHbGXe+v2W7p4C+FkrwZKBdyPsrA+P151QDoEiGQ4E7QjyCw4C7czjfjiYW0Svi8/2AB0PeX8QsOxpiArC8/owaA1Akw90IU++0Bu/fhWQFssZzJh7QGrg45PPBwK2EcwFWDHm/s2f8Qj0AhcKCm4ATS/6+Cjgv53NeGGJsnia8GKk/UkFISKBxphoANQCK9Pgjkqpbzvx9FnAt+ZOBnga2ZmHWYlgq8HVgiwbv3YFwCNQAKBQZ4RrgTPP/7YCXCjjnIQ1iD6cAN9I4MzAlZN9FI+IEGgNQKBLgLDPxQQg8SxRwznuAjiyI7N8AdGmwzW8hRgHgfPUA1ANQZI+OwESk+q9jged9FOiH8BN6EJ8VmM0CKrJ6AIqmZfzNK48x8F+kSKcDcGqB32lPJCW4AbBZyGQfHGIUeqoHoKgVLGWefN0R4c3Oxh1eyUzGRWP2/w3Jk39jXhMQcc6XzdPcF+2A+xB9wCIH2igkINmhwftbAq81eO+6kriFGgBF1WBThByzhRnYbQo450jgcaQScIzjPm1LjEuR+BCRLfucxuKiDbfrrgZAUcloDvRGWHG7A6tUwDX9DtyMkHDGVuA9a49UHTasJHyBBYHK0uWQGgBFRWF5FvDhu1b4tX6B0HWfqIL7eimNo/8rAN+hQUAF5W+icTWimfctwqrrSnUQgR4HpgEHZHC8ZYClc7rWNwkvZlIPQFEWLIYw0i4h27z5DGNEJgA/G6MyFanDn4Oo8bY251zMvNoi5bgrpjz3N8bNHkNypaDBiGrw8Rnf77VpXLl4GjAAbQ2mKBD7IkUp66U4xmgzyUYhCjrjkTLYn8kmo9AR2AhR89nIwxtZEQm+XYLw9n0xF9gL+AwJ2t1uXPcs3PSwFmMrqAegKAJLAn8hmTzV24i89jDgXZKl5dKipXmyH2YmqAuG05iHj2f14SEl7vtliMR4UixuliqleCCjpYsaAAVRGnrXIAIWrngPYbY9msKVpgCRkEuIVw6eZtb0sxOeZyekFdh81CMZiGsTeAWtgFk0bjO2ixoARdbYyAxUV7bZYKSufqinMm65sR5wC43Zd2FP3xkJz7EoUv3Xu8H735v7difwMW6B74b3dmjIcdUAKBJjTUSltofDtv80g/fVGvjefZDGIFGoRwKPc1Kco7cxklGqPq+XKAqPMEulUgHSVWjMW3ie+GYjagAUsVjaDM5die+2c5MZoLWIl5DAITlKcu2C9APohB95qVWEET4E5QEoUhTWDED63kVN/vdNDKAOIfiMqOH70RspyyVCkuveDM7xjDnW5gi7z3X9H4ZXNQugSIpTLDnkuYiS7nVITrup4TJE2z8MW2c88Zoh3Yz6I1LlvgZcDYDCCz2Q6HEHwnvq/RnVoLc1F/2d+OrENNjBxCRsrcwDpBfBSDUACh8MJrxV9gikacUovUULYRxSkhzmPd2Y87l/ZEEvg0+QhqF1CGnqO1QRSA2AB3ZFGlIQQtI5huhuNU0dyxJNXMrT/W7IH1gHt1QhGgRUNMTjIZN/lHEhN9HJb8UkokU3Ds7xvNezcBGQTn71ALzR0zzhS/EV0oxyhN4eL0xhgUBI6fJglZxiAM+RvKOxegAK/hwy+Q80g0knvz/2JrxXXx7CoQ+X/P/fOvnVAPjideDykr+vMOvV+/XWJMYLCFeiIbJu1XUuC5dW76u3XpcArlgFUbhpbv4ehshwTa3ga14Uodi2NNfdrETxtx6hws5FKLgzSF6UkwVOR3gRpfgJEQEhIyWlb0v+Ph74uw5rNQAkiPLvhhSglBMtEYXbbua1MqL028m82pE8NTcO4Sx8hVQcjjSTJ28DETbouphrSYtpSNERpC9FVgPQhHAJUqsPwuc/nPKoA21sDNEfkexC+zJcxwyEpfce0uFnFNmq+j4PbN/gvYsI7/7rg3eQCkyA6RSjlKwGoAbwIsJfn4a0on63oPOuZLyMHUpaYFcqJiNR9RcQQY401OaDgH81eO8zYK0Ux3yfhdWVtPuvGgAnjEckrG5DWHx5ohWSReiHNMuoZswFDkUafySJWcyM6CHgG2tZ2Rjs9iXMvxVo4k0/1QD4rUX/hET980AH88Q7AGlZVYuVkEnwC6I7WIp9WDh9N//4KyBCo6XohET7Typ57ykkYKtA04BxT+IAEa6sy2nyH4tkE/6LSFdtUKP3MqnXdDNurMAAKer5FNESmGLem1Ay+SeabXTyqweAi2jHR8blvzjjY6+FBBL3p2mx+5ZKsN+GEbGWKI+iDXAkwu/viCgfDzceg9Kw1QDgqgh7N8IRfyvD4+4OXFDDT/k4bIeoAGWRDtwSeEOnpi4B8kBf42a+laH7OxtpibVBEx5H1yTc77GQ907WaakeQKXjVOBvZTr3r0hd+9eIuOUEJEU3DQmsTUEi7POQxi+LGPe5NdKXoJ1ZBq1kXl0RzkGzDNqDfem5zxaEx1/qdIipAahEnAtcWeBEfwVh541GiDm/kH//gh2AVRHJrvXxK5ful+Ccv9G4Jdp+wIM63NQAVAr6A/fkfI5PkUKj1xBG26wK+e5dgK1MnGP3HHT/zwxZQnyPCH4q1ACUFZsAj+Q0GCeZp9xjxg2ulkYgqyOxlINo3FX3YoTSSwbBwF1YWM1HoQagUDxEeP16GowF7gAGEl4WSxVmVY5FgqGrpli/n4O0QqdBPcLiOgzVAFCGrr1Zq/lejTSxGEtt9z+82hi4ZxNSi5vTWNLrDB2SagCKQBukKGiTjI73LqKJ/yLF6AG0QRiOzZESYkracc1BuPEzUvTmyxvbID36GmJzRM9PoQYgN+yHtIjOAvcgpKBvMry+dgjLcHVE2XZ1JJW3tPm/r9s9AQm0TTf/fx8JQo7BP5WXJe4mvEVXe4T5p1ADkDnuI5ve8NcAF5JNCeq6SJBtW/P/FgXfk6+ROol7kVTkhALPPYHG/f7qET7DPJ2yagCywsoIh7xtBuv7P6eM4m8E7IGk2bpW6P16GklTvoIUOOWFtgiZqSFmITUAU3TaqgFIi4ORjrBp3dUjU0z83mb/ahSs/MJ4B4Ny8g66E91dqRtSzKVQA5AIf0dSV0kx1KxTkwz89U18oG8N3c8fkPZeN5GtcOqWCCmKCLn2K3X6qgEgpWwUnr3ld8U/qt8JaRt2Fuklv8YizLxKxVBj4N7MsLz6k4jPvkJiJON1GqPVgDFYAuGcJ538VyGpNp/JvxXC8JtgJkXrBHX2TwKHAWsCm1XBYN8WqdEfh8iFkQE9uk0Ef2JVc56BSDZEoR4AUVVqY1I8cXvhl9LrhagKr5TgfA8gJKThLJz2GpxzrOA3813HIeo605AUYb0xfNuSnB9xDhIoTYvLEF5FFJ4DzkYKp8hYPWoHRMBkOKJoXDsIgqCWX5sHyXGJ57nWDYLgQ89zzA2C4PYgCLpHHPOyIDvMC4LgjSAIrgqCYKcgCDoluJ9bBEEwKAiCOQnOf0YGv2fnIAiGx5xnWhAEA4Mg2DkIghUTnKNTEATbBEFwfRAE3wRBMDsIgjsT3q+Kf9WyB7AH4YITLtgU995/KyMZhS09jv8E0h3nDUtjyyE0psb6YghSzDQEUcsl40Kpk/DjUMwz26ct9d0UuMWjXPlr8/1/Mp7N7+betjJLjDaIrFnDFOztwHmI3kJtokaf/AcmfEqOCoKghcd5Bnoc+8cgCI4KgmCRmGM+mPJJP9A8qYu833sGQfC5xzV+EQTBmhmcdyXjJU3N0FO6MwiCTWrcM/7fSyf/AtzkcY69PY77XhAEWzkuIZJiRBAEfSrg3q8TBMETHtd9a4bnXiEIguOCIHgkCIKfPJZgLwZBcHJGBkmXAFXq9vencacaIopunqRxWysiug2dakljleKshIGyR01g7PMK+x3aItyAQxzTq1vRuA17Fuhs0qbLsaBAaroJdo7SHEBtZQF2Bp4hGTnHZTAcaqL7LhP/KI+U3csmc+CDe4HTqkBTYEmkRuIoh20HmO+kUAPgjc1MisYH9QhJx6XH3TBEI4+YFmP7IHJeLuho0ost8ePjH16FYiIdjPHsE7Pd9whX40edmmoA8JCo8nWBfzQTcJ5DkY7LhD7GRIxdsTZ+fPY5SO3Aa1X+W21uvLSlHOTbn9TpiTIBiZek8p3844BlHSb/uQ6T/2FTi3+755LjI099gUVqYPJjvLR2xOsGPoHUbCjUAyBOOntJ/KilLuW2zwI7xmyzfYK6gI1x5xdAvk1Ly40VkMDfcpZtPkYqA+t1qqoHQEjhyZKeIhddHTrdjo+Z/C+b7V5MEGwc4XGti9bw5Af4FonBDIhZKs01yzWFGoD/4SJEQ85nzd/F4Yk0D1gxZq2/LckEM0firjPQhabT3/40pOGnDRM9m5QoangJsAn+vf2ax6z51wA+Iz5w90mC610MyT27IKmufi1gGaTEdwnswqHDdNo2XQ+gRYLJHxftXzNm8o80Lv8nCa95nON2pzThyT/fS2sLvBCz/NpFp23TNQDv4N+2+gfs0lOfxrjjPUino7eMw3ZHI8w5hRRCXRtzT3fN4DytEf7ISmoAqgPnea4DT8bes74rdgbgiYgYR1Kc7fi0OgxppqFgIWq0rU34U8RnaYhJ385ggXjJd0i9v8YAKhQua/RS3AkcEbPetDEAdzNPmqToBnzoONCv1flO0tqO9RNw+scTHejth3Q5VgNA9eb7P0ECdljIQ9PIN/fuclP/Bpyuc9xpSfAc9uzNd47HOh+4lHgNx4m6BKgc3OSZ71835vP/xlBV007+Ox22eV0nvzOeN0YZC5/AFS5q0K9oDKBysLZZi+ORIrSxxkYj6i9h2JH0arbrO8QN6mMGtCLcYG4fw/DEsTwYh9qSQ9UAUDFsP1dcib2m/B9IXz0iOgJnIfb4smM8Q+GPF5HYDBGp3H85ag+44C7Sy7GpAUiJY5AyUhdMQppFROEgJNUWhkuBhzK43uOJr3K7FCG7KEicVj3D8hvHufhP4dczEg0Clg8+F7Yq4drx892+qCDRM2STU3a53h+RKkRFegwkOsvTnegMTDv8BD67eiwv1APIEDd4uv5jsXcDIoJfntXkPx+3RiGKbHCk5Xf9wLLfL/jFlB5VD4CycMInOW77C/AHy+fXER1t/4PZv4in/23AcTpvC/MSX8EuszYWWAX3bkcvqwEoDkOIrw7DgQhiKxraCan5JyPW2tUOZcZUWSu1zkj6tRUiW1Zf8j2mI7JkPyFdhcoFWxfhI4hOya6MlFy7YCLCDVADUADWwb210yPA3gmeDgNxE6nM6ul/lDknFVpctSXCndgRSbsuZ97Hk6g1GdE7GI4IeYygmJLmC5AqSiLUiada+CWuy4G0zFA1AI4YZay66+Ctt7DsTg15fzLZNpLcH7jf8vm0mPLWcmBjRAZ9N2D5nM81EdH2e4B8Jc0+RVKBvkuBIKOlJhoETI+NPCb/hZbJv1LE5AdpKZUlLnd4+lcCtjMTMTBP5uMLmPwYb+JY4FVz7reRXgGLZXyerS3v97bs59pwtZ3HslQ9AJILRm7met2Wzz6KqAW4CqkozApdsOf053pKfmeNNkh24hwql+J7Af4l3lhEXK8knPyzaMzTfSmH43+BsATVAyCfaj/XyX9ETHOQsMk/JePJjwPp5Mwy3ct2SLPSqRU8+UGKfN5GuPx7ZnC8qwiv82gFnIA9pYhjm/kN1QPIB09aaJ4+T/8fgfaEF/m8mfE1zzKDq1Ii/60QKe3DqF6F56ORWn1yyArYfo+fcIsNDcNPi1I9ANzaR7lO/pNinshhk/+lHCZ/j5jJ/6+C7+E5xiBlMfl/Ab5Eyqo/QFKprxtXfTQwJqfOREshlOxJ+LdKo4QE9EDEZ9db9jvD8fi9YmTM1QNIgOs8SmPrEkR0O3gQi1xxY4wxWjuFhiCeEf0hCTMbk5Eo+fNmYn+WgBi1CEKoWdMs4XaO0WLAMyN0MH5NVOY/1OotAq0zIz6b5+i13YjoN9YGKqBFcb1jK+dLLMc4NWKfe3K65l8s1zm9oPt2q2cL8VlBEDwcBMFuQRC0z/naegRB8JcgCD4K0mNwEATNPc9/fsSxbrTsc5bHNWl78IywDe4lv0sQreQTJOAKpAmy2QpKbkcqGfPCSkjeu7Xj9oMQpuKYMv3GiwAHIFH6NKXQe+HHzY8aEy2RDA0hrd9nOh77AMtSQ2MA+Al34sj6m+YZjb82p5ZSf3Loa5cXdkNELOMm/4dIZL0OiXKPKeNvPBtRV14TiaQnVT9+BL9uTMdZmsoQEdQd7HjsM0FjAEWW/K6D0Evx0AtczMOi4yn5ZQu2RT1hyEAV+YqYbd5D6K0jqmDsHQfckjBbsgHR1YAu46vOkuobk4FHqh6AA/b1oJNGTf7eEZP/rpwmPzFBrvdzmvw3xkz+CWY5tWGVTH6QlGUzDy+QBs1ajnQkB/l4B18gGRAc5dw1CJji9ZpjwOUEyzFGRezTKcfrtuHSHM53R8w596+RgNT1CQKEVyf8vaZYtj/C8dxvaxAwnefhuj5flPCqshURjXdCKMVbkB9n4Vfsabl3KEb55n7gQGoLnU2gb2P8SGR9sWsxHOMh/94CmIM73Xo6ugQgSUQXRzXY3y2de4joyJMXVo75/P0Mz3W1ZfJvU4OTf/5SZhNgH499do/pvHy9hTxFRA3HEMdz74gGAUmq8NrbYbu+xsITIa/d0IBNt8h+U0Cnmqzov4cj6TtCmG7rewRPNzJP047myTYD4cu/7LHWLRcWR2oFXIlF71m4+l8R3h4+6vfaBbf6/yHV3qy0XB5Ab9zduzD0jLj2K3O+7lVjBiAZqdwMiuAXrOcplvqp8aI+QqLWxyPy6F+Y4/xqjluJ/PbpSPbnCtzp2W9ZUsJh2I9osVgX7KxBQP/Xpo5BljcTBMaWy/nar7Nc7z9zDDKekPH36BUEwdCQ84wIgmCPCgxW7eYRGHw+ZP82EdsOt5zzOcfzbVTNQcByeABbO25n65jbP+S9j8m/p5ut1ffP5NNY5AAkX54lhiFil3VIOuunkiDmY8Y7uJXshTuS4imH+Mt8bE9jstE04N2QbTeLaSTjgr11CeCHPT3EQcOwFkIvDXORKaByMQrfk17qumEV3MHkTzm92xi2PiycVTnOuOH3Vois2XgkIzQDt6rRhgzRWy0GIwyuXYL7qgHAu5Q2Dj8RXcEXZUAeohgRTTJoUkkIa7Ghx3OamXxF4TnzlG2YXTgQUf69sALG6++4p97+zsIScA8meCB94igUogbAI8CVJvgH4c08fsLe9TcrNI8pr02K+0K8mQFlGhP3m6XBP2nMoZ9N+aPeAeG6D2Eo1YGYGaELsV/CcViKDdUAuGE9x+1s7lfPMj3942oXZqUwin0baBoeUwFj4xAaFz61RNJjT5b52mZ5GIFh2Dv9tEUqPElR2LW9GgAyDQC+ZclrRz21KKiyLYtehjRg+5WiG5XVlruOxinO3cz37V7Ga/sZN8bg1iwI1EVxOPrg32bMZVyqAcA/YDLT4k5HSTP/t6Dr/yXh8iAK3Rq4jz0yus6WiMRWVqSoDQnPRIyKcaHzxju4FQXN9xDHEd3+KyrmMJXseC1N2gDUOcovj46hfRJBGinqqYMlkOeLextQf0cmvK69jRc02TyZZxtjNdX8PdVMgj4pvvuJhNOvH8Demj1vDMKtjn++p/VvwhWKscjV41ATsIgaABKX0ZZiaIIg4tyCvsN3ls/a4y+Fvm7J0uKcBL/dxWaCP4R0KWpnGaB7m8EfkLzX3S0RT/zLkah7ubA/8APxcvKtI4xFZ8t+72Y8vpusAejm0TAiDMtarreo72FLC3VI8ESNW4NG4TSkFuKCBN/hINJxFh4E+hGuzPR4GcdyN8elwEu4B5fBvaXZpmoAsgmUjCdaBQaLJn4R+NjyWaeEBuBj/NpPj8QucY2lZ0JLGqcck+BxwjMVfUmn658GPxItAEJJkc96nnGAT3Fvg6YGIAMXaRzRsmBRaF3Qd7A9OVfBr1cfMeo0hOgizEGqAUnYpy/LpdLtEb0R90Kk3suBvxIvAX8u4VLj61tKlF2wuhoAO1wmiO3HWytmchSBeRYhk574y6F9QrgoBREZiBYJr/vsnARSzwdeCHn/dOztuPJELwdR1yU9yTyTMjhvkzcAKzpsY6tR39zy2bIFfo9XMnAB5xuAox23/yKlkbuPfHv8hXEgbk7hrZAyThMnH76C5wPqy5SFYmoAHNfpb5OMc10kEWN0ykzA4khUfiZuKaabgdVyXLpkgXUt8YpydEg+lGyp3hOpUTQrkAOQdnI1S+gdZA1bdd4mDvv3LFmv4iCHfkIZxsRSnvt8BPyfxQgUjWmIfLsvlrb0WXDBsmoA0t2Y8QmDfEXe+Pdi3OE4HFgi9Y1DqW4WWMtj2/1wz32X4gokEh9mxM4vw9hOog3ZQQ1APljOI5WTJH5QZElmvVmTkzAQtIEDrXi+W90jwyYceHAMVsO9cAsHPsOlJCcfkYK1OTSjcTrWcf/l1QCE4w+468CFoSPxraVbFXjf7k2R6lwVtx53R2R4vSc5EpV2YkE0/AqSeUfPRnz2bBnG9//h33eRiHJzHGXN1QCkyNP/msKArFvgfbsvpn8fMc0yn3I4x9EZX/N/YzypzVhYhSlp3cBhlt/ngILH99v4dYjqkLLUW5cAKQ3ANEvkPA6bFHjfvrK4hYc4TMRXie87t2hOslrXNHDH10cKiYZnxG//gejinPsoDzkID2WmMMzAvXO0GoCEExii6+2XyFBrICvcFPF+v5j9vrYEO+djzRyv+0yE3RaY10ikmIaIgiUSVg5mEY/IAjd7bLtESg+gpRqAaLcXB5adbY0fh20Lvnc3WD47GH+x03J5M2RQwEVIAO7fEZ/dSvHBwE9Ir/moBoB8tPRcrqXeUbG3c8HadFFKRJcQL06BJ1OtHEjjiVyDn6x7nritoAmsBiACc1Lu71rE0o/KyDWvTHgrKnBTD55TIePDJQ6xuYUyHfU9rir4ezxd0AQO1AAkf4Jnsf9xZWhmGRXQ+0uK435bIePjO9xy/22JFhAhIt++XoHfY1zGD5oky9gmbQBmpKQMz/JgvC1Z8D08zsJHT7qmHF4h4+MTRyGMVp6BUvDP0afFW6QTfS3CgDR5D2Bxz/QgEVHuIvEp0c0kk7q6Y6keD2ANonPtY4EppGsRT4YKxzjIjZNC73GWGoB0ljXqRk/Fr0adCqk+O4NkbbWm484+yxPDHbIEnWMM9I0Voqb7WooJvGjGnq4aAPzysD94nm/nMqSazsK/etCGOyn/039yBiIYTxfIdky7BJiZIo3t+6BqUgZgiuN27T2rBKNwZRnu5bURhmpnYEuSKfCWE3/DTY03TpL93QwaxWaByY506TRLgJ/UAKRr3NE5o8Yf3bCLiFKwHNWwBMf6hnjKcJ4Y4EhY+jBFCXUzotOleeBz4pWX0ki+T1QDQKo0zDIFUHXJOSB4NeFEqBtIpndfDlxMfEprU0u/PR8DuE2B32tMQgPh2gLtazUA6bB6gkIhLNVta5bhO5xDuLLRyQkovhMpnjQzA+kEHIfTiZdxm4//EK+PWAQmJXThu2Xs6TZJAzDTQywjjT47Za4+g2gxzLcS3PPzPBRpKKiFewsWpPH+Q7puTz0oNliLJYc/O2XPBw0Cplwf2daDo/DPDmxAeRo31hOtMjsq4aScVsB174WbAu7lJS7vrJTBsXYk66tIxuKon2HnOqCioPmuv8AuWPFFhFb+nQlbjRUR99g4wp18JMHx2udMNOnvuJ6HBTUQt+OnE0AGTVXS4MuEXZ9cdBE+UwNgx/ukk2X6LKJabaDDdxxA+dpX70h4+utmz2P9jgirDMvhOjcG/oW/wMYgj3N8XQFqTpMSTOA2uKlav6wGgMT5YByEFd+xPFniesKdQrG9Axp6IGFtzU8gWQutbZBOv1lUng02g/sdx+2XKnn6f0m0iKuvAdiK4uTCozCCdIrK36kBSO5+uZBDfogY9DuZp1Lg8DQuF55CGlMSEklPkh58xPx2xwK/Jdh/qPGe9k9gMPAgCuGg+Gzz+iiwLP1Vi3eEY28ENQAka/qBo7TXByHvbY+7ItCHZbzXQwiPeJ9McrrwP5DqxzWRGohXzVKBkADs/YgoZyskMPq557l2Z+G+B7dmyMQrqoKzpWV5NdPSS5AqquCsaB7AhBQpNCKCZ1uXkE0ed2AI3lXG+z0S6T7zXUgzjo9JXj78ORKZ3xopXGmB8NebGRe/E9KQ5AGSlbzWAU+Qjmr9K+ll49OiTcT7zxBPeMqCatzkDcDQlFJUQyIKiDp7KAIdWkJiKQcmI5JfDeXEuhoXtSfZpCHnZKhQ8ybpa/mnVYCcdmdPpmIL3Jp9vAOaBnTBC47bbeWZQz+gwUSKw3XAPmW+9wdGxAXexq4pSBlUdUsZjOcmNCz1GcjGk0G2A4+KRVfm5qtqAMg0FWh7kr8R8t5RLMwYPMXhHA+WQUo8zKOpAx6msZzYWERbsJw4iYWbk07HT2fftUFsUWKaOxJdeBWGXRJ6SGoASC4xBQsCe2F4mPDegIs1EKF4Arcild4V8DvsY+IToxqQY74uozewR4iYRx/y6Q0xryCB0/U89RpcDcBzagDwaiXtgq4eBgAaa/HvgVsV4otm23LjIyQA2pOF+fV/MS73iQVey47AYw3eexw3Wa0kffOmF/Cd9sY9sIwHA3AOVSgFVk4D8JTjdrtYagq+jehqSwjF1EWP8DHg1Ar5Td5FSEtrsHDG4iZjCK4m27LpsPv+bA6S6yuXOYJ+hOd4dF3/PwtaC5CHAejv2e5pDcJrCZb1UMAZVEG/zRjgcLN27sOCmoazEErrr8Y7yLIZytGEB8T+lMGx10qYIswCrQgPLL9PtJLvUfiTo6oOdUFQll4GgYdI6MyISf1DhADlKRFFRuM9GIvrU0z1XRJsaNzZnUtc1DlIKmooQkj5EuEa+OT8byVc4vwiRCAkLaYSnYd/gYVJRnk8/QdGvB9VTPYLbi3plqjgsVKxBuApYFfcNPdvs1RvdfWINnf0lGzazaOjDGXu3tPLPGHbGoM5AWFNjnbsaDsqwnt62qHdeRZGfxBwJPlK0nXwGCtr4qY/Ma7ASsacHsVBUI5X38ANn1mO0T9in4Ms+3QI/PB8EAStynSPinjtZvnuX2Z4ns4x9/nkHL9j94hzPmrZ52bH8XFOtY+BcnkAdbinfpYhWlAiiKAbLx+zHpxkaWdFRP37NdQWHgf6El141THDc+2HPd22IdHCoWnxUEQGYEvCOSU+S9SViOYQaBAwxh18zXHbky2f3R+RbuoZU1e/pCd982oTqOpXAxN/F3P/+1ok3DtSDAMPB6UeUnL/944IOr6RsjT5x2qf/OUWBXVV7T3L8tmlJG/JtTF+hUFLIoo5Y/AX96wEbI4QsZ6OEcxYKodz9ymTnPb5CfoSuraWu6MW3MByLQF8Xa3tgJeILvHtFhH5d+myexDuajg0yBacAvy7Cp74NxCvv/9aTsIcccu9jzxUd7MaX3WWrJMrKakLVSgDXmmy4A9l0O/vhIj3Xdfs9yLZBN/OrqshXP7fEbruChX22x6HiIU87TD5/5qjKk+vMklpXUB0utN3H0LUjap+8leCB7Ah7lJh7YmWdY5KCS6Hn1b7/aRrxjEWael1H/79DLPAlkhD0t099tk2Zz27m7DTmHfAvUo0C69jMYv4h+tkOLzMuhI1YwAwLpeLLPTfgeMt69s3Iqq0Nve8nk3Nk70d6fshPmheo/HTz8Ojkcp2SKDL9wn+H/N0nlbmZd5ijj0jfDCQcOrvAMIp4yAl5fdlUNmoBsATf/GoeGtFNLttDFIV2BA9PbwMGgSDrsm4485/zJp3NEI0+dZ4NVNiquiWNN7MBkidwPrGe0qK441BzRvrxJCRRpO9IvAyRKv/tiC6NmSSY41F3qQlmgIRqPTV0oOYc4nlOD0i9pmY8vquCmoH9wdBsEiBv+2gmOu5MIdzvh1xrvMs++zkcQ9XqSUyWCV4AAB3A4dk4H4NJbzZ5KkkU98t9TyutyxBKh1vI8VVYyosy7MW2TbU2IPGZcwu4+Yrxy7FHxCuKYBmAdLBR2PuQvyVhAYgYpxJ8TuSbahDMhL1VfL7vmRc7E3KMPn7El8clHU3nccshgGL9kEXD4Uk1ACQi1qwq6zyRRb13CkWA/F6Rtd6uTn/1lSuEsytCB16Ow859qxxScFEmqcsPBGbOpQrB+SbDMeQGgDcBRuIyAjYBt60CHczS9GPVxGGWx3SzKTcraGeQVJqdcZbmVDGa9mMeHJPlgHW3YmuLu0T0wy1veM5TqEGUSkxgNK1as8MCjG2sFjrVZF8fV7YySxFdvcYXCQscX0CkUirtL50H8eoM79HuiwGDerxf7MsLa/IgIn6G8U1L2nSBmBt3DUD4wIydxMeWPwhh2IXGzYyg/2PSK5+Ffw4BrMRDsFrSBpxNCJmOrdCx1QvB4OUJfnoPSQ96vs734J7ULcf8U1n1ABk6MruTDaiHbMJl5x+gIV7CZQDi5vXUuYp1hwJNv6GBMimkz1Bpgj8jL3Tz3dkR5s+C6nUxLMWZAWPSr7xlF+evUkZgPaerLm6hESUA1L05FPgJb1Fg+avj2Vwru5EN4o5D3tF6OcIi9IFSYlkaBAwGX7Cr2323dgrzS608P5X1TlL1hRcYujRj2Uk8hk1+UfFTP7jPSb/K7U8+SvVA6CkWUSdR735cwnWiSBNNOfo3E2NZ4nuvDMfO5NN+fREy/q+uaUQaDn8xEeWTNh+XT2ADLCX5+CzddbtEeMOKtJhf4fJ/2lGk/81y+RfL0Z7YAR+YiK/1foPV8kG4DHcewnOd9dsWCPi/VWqQNSjktE+QpqNkIBtWtyDlDyH4VgkMxSFGwhXPiZCEvzypvDjNavw6+vjKXl1LvZGG9tZzvOwzuVEGOWwzY2IglIa3EB0s5iBwD+w95o8Gb+ScNQAlB8/4Ncc80rsApQvAYdZlhyDdT574T7cOhOlZdFdapnAQ7F38WnLgq5KOArANpllYSUHAWlQK9DJY/u4wN6lFpmxR4huJKlgIZbdZQ7bbeWhAE2EwOs5RDMO13F4iCzrIU7Tpin9iM2q5Do38tx+tIMIyQCLJ6AxATsOdpz8t6ec/LdYJv93DpP/CY/Jn2ScqQEoCN97upFrOLjzpxHddqyPZgewlfn+09FrOybFeV4kmqo7mXg24WX4aSNegFs7MF0ClBFv4hegOQu4NmabOy1xgXqkVvwbnff/m/yunPi2CKXZF62BLyyxhV+wU40hvhMRtS70UasGoFkCMY6+wJPElxcfi1004nmU5juQfOmz6wMjLZ9/QTyLrwdSNOVrdGY1xR+1WZVd77wE67QngN7Ea+jb6KPPIRmGpoqLPSb/ngkn/4kxk3+kw+RfLcHk79lUJz9AtYoZnpRAEHNLh+OeHHOMT4MgaF3D3YLDXo943OOkXX6fiTnuMw7HWD7BmDi1if2WFSsKmgS2tTuWxhlvEC/oMYT4dltDavzZsAySZlvGw0u4yPMc65kndnPLNjYtfxKU91IiBda/qQd1qtkAgJ+CkM/kXc2sN4lpr92vRsdFP6QRqisuQ1KrPriReJHNw7BXe2KWBb4Zm3cTjBs1ABWKX/DvaLsf0rEHB5prd9JVIlYbHjHreFec59iNuTTQ9xrxhJtuxKtDbYBUevpgKpKhUFRhEDAMyyfYZ7CDWznfRb3GoRLxjQpsDuqLPY1Gns/kP8Zz8t9lgnltYp7OdQ6Tv3eCyQ9u1GU1AFWE6QmNwPXEcwQAzia+w+3mZg06oArvX3eEOfmI537bIEw/FxxrjMuhxDM0ezqmJF9M8F27JOQm6BKgCrBOQg38YRHdhMIwBAkSZu0WlwNdEP7D9vgXaK1NdKdmGgRU7yFeHXki8CfcKgb/aoyyL9YtY48E9QAKwEckK+PshUhsuxSB7Iy9ywwlVYlBgsBYUYbyJaQd1vYJqv86Okz+Pc2kHuIw+S9GCr1cJv/zCSf/xjr5a98DoKSW+82E+26AuwjJQI9mJn9HIuXfUz4F4iOBM1LEKuLkvFoiUf3LgUUdjvcpos8wwbEHxGeOxw1bnr2pU52aIgLFvTZN0UH3aI/zdAmC4EOPY78XBEG/gu7B4kEQHBgEwZspOwo/EnOezYIgeNDzmHt7fI/+Ka69R1Mn+tQyEQiHCP77JE+F7e3ZDeh+/LrHPAzcTLpy2TDvZ0ckj79OymP9inAmhkfED443r9b49Qu80HPJkbR/w5poRWeTXAI0dB3Hkbwj8KaeRuRwRJqqhcc+c43x+JeZbLZmIIuZ9fJySLOKbkjxy7oZtyE7AmFaNjSo/REtgPYJmpWe6dHopCsi4LlEwutfFr/eEmoAahhtgUmIljwJRSlO9NznEOBv+LUAm485xvjUI0HaFp5P2TS4AFFLAmnwuaXxArZIeLzbEOWgyfjJf52fwmtpX0Xt29UAUKx4ZfeE+9abgNUw/DMM18TIklcC5iAR9tbGm1iGdBWbfzHfe47nku2FFOce0ZTEPNUAJMMg46aTQqVmL/z14pdHIuQnkyySTZWItVyJ9HYkQWHOQSnO/Q/seg4KNQD/w1G4M9iw5Pn/THLm3dmUvzlpFhiDsB/vNMsWX5xqlkppcKQx7Ao1APiQYUYS3jnYB2cglOKk2AQJrPUDOlTJvXsduBfJlExOeIz+CI8izf2fizASx+g0VgOQFE+STceaU5DyVlJ22OmFsOh2InkEPGt8hRRPPePZWouIFmJ3I7LtafAUfoKfCjUAkTgUqVLLAmcjnY3nZXCspZHg4XaItn4X816e+AYRAXnerOmz6oy7D8J5WCaDY/U3MQOFGgCyVL95i+zahd+MqOP8nMO1dkIES5YxRmEN4z0sjdQztDLltEHJa455TTVu+zjgE6QG4ltgLDAjh2s9Cam4XCSDY72PpCWn63BVA5AXziS+/t8HwxH22wtN6B6uhqQBs5TbOo7oHg4KNQCZYimz3t08w2PONEuDu8zTttbQGslqnIYE5rLCu4jwx286LNUAFI3diO8nQEK22h1IJP3DKr4/nZCeC0eTnGBlw77AQzoM1QCUG1cgAh954R2ki80LZl1eqWgB7IBkKfrhV/jkgwGOcm0KNQCFYUkkb70XxVCWH0UUj0dRvqKWFRCewqbmadwp5/M9h7ABf9bhpgagUrGCWcdvW+A555q4wXBEQ39+5P5LRBE5DZZAsgirmAm+JaKes3yB3284Qs9WQo8agKrB6kh0f18qRxp9CpLmmwPMNu8HCNuuNaIKNP/fNhVwzcMQKvCHOpzUAFTz0uCvpGuD3dTwKHAOwjBUoKKg1YwpSBVaczOop+ktwRbcWxqJo+jkVw+gZtELqRTsrbeCzxF59Lv1VqgBaGpojUhrneTQ1rqWMBnhOdyhT3o1AArBH5BGl0ciYpW1hklITf4gnfRqABTxnsEuSIPSbcmPUJMn6pEo/qPAE0hqUqEGQEGySsSexihsBaxVgdf4HVItOQR4BRivP5saAAW58gzWAXZFquv+SHGKQR8AX5vJPgIhHM3Sn0QNgIKKkDhfEWEkzn91RuTH2yN19y2QtGQdC1R65yHkoJlI6nKieapPQERAvjV/60RXA6BQKFAikEKhUAOgUCjUACgUCjUACoVCDYBCoVADoFAo1AAoFAo1AAqFQg2AQqFQA6BQKNQAKBQKNQAKhaIC8f8ztwY7rSuxUwAAAABJRU5ErkJggg==';}
const SHN=2048,shTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,shTex);gl.texStorage2D(gl.TEXTURE_2D,1,gl.DEPTH_COMPONENT24,SHN,SHN);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
const shFB=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,shFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,shTex,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
let SVP=null,shadowOn=0;
const U={},SU={};
['uVP','uModel','uTime','uBloom','uTintOn','uTint','uSunDir','uSunCol','uSkyAmb','uGndAmb','uFog','uCam','uLampPos','uLampDir','uFogDen','uLamp','uNight','uEmis','uAlpha','uSpec','uShadow','uShadowVP','uShadowOn'].forEach(n=>U[n]=gl.getUniformLocation(P,n));
['uInv','uCam','uTop','uMid','uHor','uSunDir','uSunC','uMoonDir','uNight','uTime','uSunVis','uMoonVis'].forEach(n=>SU[n]=gl.getUniformLocation(SP,n));
const ATT=[['aPos',3],['aNor',3],['aDry',3],['aWet',3],['aMeta',4],['aAnc',3]],STRIDE=19;
const skyVAO=gl.createVertexArray();

// bloom texture: 1 texel per meter (4096 m ring) holding [effect, time]
const BLOOM_N=4096,bloomTex=gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D,bloomTex);
{const init=new Float32Array(BLOOM_N*2);for(let i=0;i<BLOOM_N;i++){init[i*2]=-1;init[i*2+1]=0;}
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,BLOOM_N,1,0,gl.RG,gl.FLOAT,init);}
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
const texel=new Float32Array(2);
function setBloom(m,b,t){texel[0]=b;texel[1]=t;gl.bindTexture(gl.TEXTURE_2D,bloomTex);gl.texSubImage2D(gl.TEXTURE_2D,0,((m%BLOOM_N)+BLOOM_N)%BLOOM_N,0,1,1,gl.RG,gl.FLOAT,texel);}

// ================= mesh builder
class MB{
  constructor(){this.a=[];}
  tri(p,q,r,m){let n=cross(sub(q,p),sub(r,p));const l=len(n);if(l<1e-9)return;n=[n[0]/l,n[1]/l,n[2]/l];const A=m.anc||p;
    for(const v of[p,q,r])this.a.push(v[0],v[1],v[2],n[0],n[1],n[2],m.dry[0],m.dry[1],m.dry[2],m.wet[0],m.wet[1],m.wet[2],m.s||0,m.mode||0,m.kind||0,m.w===undefined?1:m.w,A[0],A[1],A[2]);}
  quad(p,q,r,s,m){this.tri(p,q,r,m);this.tri(p,r,s,m);}
  triN(p,q,r,np,nq,nr,m){const A=m.anc||p;for(const[v,n]of[[p,np],[q,nq],[r,nr]])this.a.push(v[0],v[1],v[2],n[0],n[1],n[2],m.dry[0],m.dry[1],m.dry[2],m.wet[0],m.wet[1],m.wet[2],m.s||0,m.mode||0,m.kind||0,m.w===undefined?1:m.w,A[0],A[1],A[2]);}
  upload(){const data=new Float32Array(this.a);const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    let off=0;for(const[n,sz]of ATT){const loc=gl.getAttribLocation(P,n);if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,sz,gl.FLOAT,false,STRIDE*4,off*4);}off+=sz;}
    gl.bindVertexArray(null);return{vao,buf,n:data.length/STRIDE};}
}
function perp(d){const a=Math.abs(d[1])<0.9?[0,1,0]:[1,0,0];const u=norm(cross(d,a));return[u,cross(d,u)];}
function tube(mb,a,b,r0,r1,n,m,cap=true){
  const d=norm(sub(b,a)),[u,v]=perp(d),ra=[],rb=[];
  for(let k=0;k<n;k++){const t=k/n*TAU,c=Math.cos(t),s=Math.sin(t),o=add(mul(u,c),mul(v,s));ra.push(add(a,mul(o,r0)));rb.push(add(b,mul(o,r1)));}
  for(let k=0;k<n;k++){const k2=(k+1)%n;mb.quad(ra[k],ra[k2],rb[k2],rb[k],m);}
  if(cap&&r1>0)for(let k=0;k<n;k++)mb.tri(b,rb[k],rb[(k+1)%n],m);
}
const ICO=(()=>{const t=(1+Math.sqrt(5))/2;const v=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(norm);
  const f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];return{v,f};})();
function blob(mb,c,rx,ry,rz,m,seed=0,jit=0.18){
  const vs=ICO.v.map((p,i)=>{const j=1+(hash(i+seed*13,seed+1)-0.5)*jit*2;return[c[0]+p[0]*rx*j,c[1]+p[1]*ry*j,c[2]+p[2]*rz*j];});
  for(const f of ICO.f)mb.tri(vs[f[0]],vs[f[1]],vs[f[2]],m);
}
function boxR(mb,c,hx,hy,hz,ry,m){
  const cs=Math.cos(ry),sn=Math.sin(ry),P=(x,y,z)=>[c[0]+x*cs+z*sn,c[1]+y,c[2]-x*sn+z*cs];
  const v=[P(-hx,-hy,-hz),P(hx,-hy,-hz),P(hx,hy,-hz),P(-hx,hy,-hz),P(-hx,-hy,hz),P(hx,-hy,hz),P(hx,hy,hz),P(-hx,hy,hz)];
  [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]].forEach(f=>mb.quad(v[f[0]],v[f[1]],v[f[2]],v[f[3]],m));
}

// ================= world
const terrBase=s=>3.5*Math.sin(s/190)+1.6*Math.sin(s/71+1.3)+0.35*Math.sin(s/29+0.4);
// [Argus app] race relief: while a race is set the road follows the course's elevation profile
// from the start line on (flat sprint, climb only uphill), continuing at the last grade after
// the runout; behind the line it eases from the procedural terrain to the start level.
let course=null; // {origin, base, d:[m], h:[m from the start], tail: grade (m/m)}
function courseY(s){
  const c=course,x=s-c.origin;
  if(x<=0)return lerp(terrBase(s),c.base,smooth(-160,-30,x));
  const d=c.d,h=c.h,n=d.length-1;
  if(x>=d[n])return c.base+h[n]+(x-d[n])*c.tail;
  let lo=0,hi=n;while(hi-lo>1){const m=(lo+hi)>>1;if(d[m]<=x)lo=m;else hi=m;}
  return c.base+h[lo]+(h[hi]-h[lo])*(x-d[lo])/Math.max(1e-6,d[hi]-d[lo]);
}
const terr=s=>course?courseY(s):terrBase(s);
const terrD=s=>(terr(s+0.5)-terr(s-0.5));
const roadX=s=>18*Math.sin(s/260)+7*Math.sin(s/97+0.5);
const roadXD=s=>(roadX(s+0.5)-roadX(s-0.5));
const biomeAt=s=>0.5+0.5*Math.sin(s/260);
const cliffEdge=s=>46+7*vnoise(s*0.012,9.3);
const SEA=-9.6;
function groundY(s,d){
  const r=terr(s)-0.06;
  if(d>=-5.5&&d<=5.5)return r;
  if(d>0){const n1=vnoise(s*0.03,d*0.035),n2=vnoise(s*0.007+7,d*0.009);return r+smooth(5.5,42,d)*(1.2+6.5*n1)+smooth(50,230,d)*(10+34*n2);}
  const a=-d,ce=cliffEdge(s);
  let y=lerp(r,0.3+1.4*vnoise(s*0.02,3.1),smooth(5.5,24,a))+smooth(12,40,a)*smooth(ce+1,ce-6,a)*3*vnoise(s*0.05,a*0.08);
  const beach=-9.25-smooth(ce+6,100,a)*1.6;
  y=lerp(y,beach,smooth(ce,ce+5,a));
  return a>110?-12:y;
}
const LAT=[-150,-112,-96,-84,-72,-64,-58,-53,-50,-47,-44,-40,-35,-29,-23,-17,-12,-8.5,-6.5,-5.5,5.5,6.5,8.5,12,17,23,30,38,48,60,76,96,125,160,210,280,370,500];
const COL={
  shoulderD:cc('#c9ad7a'),shoulderW:cc('#86b158'),caatD:cc('#b9a076'),caatW:cc('#6c9e46'),serraD:cc('#9c8a68'),serraW:cc('#5f8a4c'),rock:cc('#a39c90'),
  sand:cc('#efd7a4'),sandW:cc('#c8cf86'),beach:cc('#f3e1b6'),wetSand:cc('#d9c08e'),
  strata:['#d9774a','#c45c34','#eaa266','#b44a2c','#e08a52'].map(cc),
  asphalt:cc('#3d414a'),yellow:cc('#f5c542'),white:cc('#f2f2ea'),
  branch:cc('#7d6b5b'),leafD:cc('#a59a6e'),leafW:cc('#3f9a4a'),cactD:cc('#8a9670'),cactW:cc('#3c9a58'),palmD:cc('#9c9a70'),palmW:cc('#4a9a7c'),trunk:cc('#7a6450'),
  ipe:cc('#ffcc2e'),pink:cc('#ff7eb3'),flowerW:cc('#fff6e8'),caju:cc('#e8452c'),cajuD:cc('#8f8a5a'),cajuW:cc('#2f7d3e'),grassD:cc('#b8a066'),grassW:cc('#56a640'),
  roof:cc('#b8532f'),door:cc('#6b3d2a'),win:cc('#3d6f9a'),tower:cc('#f2f4f7'),red:cc('#d8362f'),hull:cc('#6a4429'),sail:cc('#fbf6ea'),sea:cc('#2f9ab8')
};
const HOUSE=['#f2a7b8','#8fc9e8','#f6d36b','#a8d8a0','#f4efe4','#c9b3f0'].map(cc);
const M=(dry,wet,s,extra)=>Object.assign({dry,wet:wet||dry,s},extra||{});
const WP=(s,d,yo=0)=>[roadX(s)+d,groundY(s,d)+yo,-s];

function groundMat(s,d,y,ny,rnd){
  const v=1+(rnd-0.5)*0.08,V=c=>[c[0]*v,c[1]*v,c[2]*v];
  if(y<SEA-0.3)return M(V(COL.wetSand),null,s,{w:0});
  if(d<-5.5){const a=-d,ce=cliffEdge(s);
    if(ny<0.8&&a>ce-3&&a<ce+9){const k=((Math.floor((y+40)*0.9))%5+5)%5;return M(V(COL.strata[k]),null,s,{w:0});}
    if(a>ce)return M(V(COL.beach),null,s,{w:0});
    if(a>14)return M(V(COL.sand),V(COL.sandW),s,{w:0.55});
    return M(V(COL.shoulderD),V(COL.shoulderW),s,{w:1});}
  if(d>5.5){if(ny<0.78)return M(V(mix3(COL.rock,COL.serraD,0.3)),V(mix3(COL.rock,COL.serraW,0.4)),s,{w:0.5});
    if(d<60)return M(V(COL.caatD),V(COL.caatW),s,{w:1-smooth(30,60,d)*0.25});
    return M(V(COL.serraD),V(COL.serraW),s,{w:0.7});}
  return M(V(COL.shoulderD),V(COL.shoulderW),s,{w:1});
}

// ---- vegetation and buildings (world coordinates)
function shrub(mb,b,sz,s,seed){
  const n=5+Math.floor(hash(seed,2)*3),h=sz,tips=[];
  for(let k=0;k<n;k++){const az=hash(seed,k+3)*TAU,el=0.35+hash(seed,k+9)*0.6,L=h*(0.6+0.4*hash(seed,k+11));
    const dir=[Math.cos(az)*Math.cos(el)*0.7,Math.sin(el)+0.25,Math.sin(az)*Math.cos(el)*0.7];const e=add(b,mul(norm(dir),L));
    tube(mb,b,e,h*0.035,h*0.015,4,M(COL.branch,cc('#5d4a3a'),s));tips.push(e);}
  tips.forEach((t,k)=>{const r=h*(0.16+0.1*hash(seed,k+40));blob(mb,t,r,r*0.8,r,M(COL.leafD,COL.leafW,s,{mode:2,anc:t}),seed+k,0.3);
    if(k%2===0){const f=add(t,[0,r*0.6,0]);blob(mb,f,h*0.06,h*0.06,h*0.06,M(hash(seed,60)>0.5?COL.ipe:COL.pink,null,s,{mode:1,anc:f}),seed+k+5);}});
}
function mandacaru(mb,b,sz,s,seed){
  const h=sz,r=h*0.06,mat=M(COL.cactD,COL.cactW,s),tops=[add(b,[0,h,0])];
  tube(mb,b,add(b,[0,h,0]),r,r*0.9,7,mat);
  const n=1+Math.floor(hash(seed,2)*3);
  for(let k=0;k<n;k++){const az=hash(seed,k+4)*TAU,ay=h*(0.3+0.3*hash(seed,k+5)),out=h*(0.14+0.08*hash(seed,k+6)),up=h*(0.25+0.25*hash(seed,k+7));
    const p0=add(b,[0,ay,0]),p1=add(p0,[Math.cos(az)*out,out*0.2,Math.sin(az)*out]),p2=add(p1,[0,up,0]);
    tube(mb,p0,p1,r*0.75,r*0.75,6,mat);tube(mb,p1,p2,r*0.75,r*0.7,6,mat);blob(mb,p1,r*0.75,r*0.75,r*0.75,mat,seed+k,0);tops.push(p2);}
  for(const t of tops){const f=add(t,[0,r*0.8,0]);blob(mb,f,r*0.9,r*0.55,r*0.9,M(COL.flowerW,null,s,{mode:1,anc:f}),seed,0.1);blob(mb,add(f,[0,r*0.3,0]),r*0.35,r*0.3,r*0.35,M(COL.pink,null,s,{mode:1,anc:f}),seed+3,0);}
}
function xique(mb,b,sz,s,seed){const n=4+Math.floor(hash(seed,1)*3),mat=M(COL.cactD,COL.cactW,s);for(let k=0;k<n;k++){const az=hash(seed,k+2)*TAU,e=add(b,[Math.cos(az)*sz*0.5,sz*(0.5+0.4*hash(seed,k+5)),Math.sin(az)*sz*0.5]);tube(mb,b,e,sz*0.08,sz*0.07,5,mat);}}
function rock(mb,b,sz,s,seed){blob(mb,add(b,[0,sz*0.25,0]),sz,sz*0.55,sz*0.85,M(COL.rock,null,s,{w:0}),seed,0.35);}
function carnauba(mb,b,sz,s,seed){
  const h=sz,lean=[(hash(seed,1)-0.5)*0.12*h,0,(hash(seed,2)-0.5)*0.12*h],top=add(add(b,[0,h,0]),lean);
  const mid=add(add(b,[0,h*0.5,0]),mul(lean,0.3));
  tube(mb,b,mid,0.26,0.21,6,M(COL.trunk,null,s,{w:0}),false);tube(mb,mid,top,0.21,0.17,6,M(COL.trunk,null,s,{w:0}));
  const leaf=M(COL.palmD,COL.palmW,s,{w:0.7}),pet=M(mix3(COL.palmD,COL.trunk,0.4),mix3(COL.palmW,COL.trunk,0.3),s,{w:0.7});
  const n=13;
  for(let k=0;k<n;k++){
    const az=k/n*TAU+hash(seed,k+20)*0.4,el=-0.25+hash(seed,k+30)*0.95,pl=1.2+0.5*hash(seed,k+40);
    const dir=norm([Math.cos(az)*Math.cos(el),Math.sin(el),Math.sin(az)*Math.cos(el)]),p=add(top,mul(dir,pl));
    tube(mb,top,p,0.045,0.03,3,pet,false);
    const side=norm(cross(dir,[0,1,0])),up=cross(side,dir),R=1.5+0.4*hash(seed,k+50),pts=[];
    for(let j=0;j<=10;j++){const a=-0.75+j*0.15,r=R*(j%2?0.78:1);pts.push(add(p,add(mul(dir,Math.cos(a)*r),add(mul(side,Math.sin(a)*r),mul(up,-Math.abs(Math.sin(a))*r*0.25)))));}
    for(let j=0;j<10;j++)mb.tri(p,pts[j],pts[j+1],leaf);
  }
}
function ipe(mb,b,sz,s,seed){
  const tips=[],bm=M(cc('#6e6052'),null,s,{w:0});
  const br=(p,dir,L,d,sd)=>{const e=add(p,mul(dir,L));tube(mb,p,e,0.05*(d+1)*sz/5,0.04*(d+0.6)*sz/5,5,bm,false);
    if(d===0){tips.push(e);return;}const k=d===3?3:2;
    for(let j=0;j<k;j++){const az=hash(sd,j)*TAU,tilt=0.5+hash(sd,j+5)*0.4;const nd=norm(add(mul(dir,1.2),[Math.cos(az)*tilt,0.15,Math.sin(az)*tilt]));br(e,nd,L*0.68,d-1,sd*3+j+1);}};
  br(b,[0,1,0],sz*0.38,3,seed+1);
  tips.forEach((t,k)=>{const r=sz*(0.13+0.07*hash(seed,k+70));blob(mb,t,r,r*0.8,r,M(k%3?COL.ipe:cc('#f0a419'),null,s,{mode:1,anc:t}),seed+k,0.3);});
}
function caju(mb,b,sz,s,seed){
  const tm=M(COL.trunk,null,s,{w:0});const j=add(b,[0.2,sz*0.3,0]);tube(mb,b,j,0.22,0.17,6,tm);
  for(let k=0;k<3;k++){const az=hash(seed,k)*TAU;tube(mb,j,add(j,[Math.cos(az)*sz*0.35,sz*0.25,Math.sin(az)*sz*0.35]),0.14,0.08,5,tm);}
  for(let k=0;k<7;k++){const c=add(b,[(hash(seed,k+10)-0.5)*sz*0.9,sz*(0.5+0.25*hash(seed,k+20)),(hash(seed,k+30)-0.5)*sz*0.9]),r=sz*(0.2+0.12*hash(seed,k+40));
    blob(mb,c,r,r*0.75,r,M(COL.cajuD,COL.cajuW,s,{mode:2,anc:c}),seed+k,0.25);
    if(k%2===0){const f=add(c,[0,-r*0.6,r*0.5]);blob(mb,f,0.12,0.15,0.12,M(COL.caju,null,s,{mode:1,anc:f}),seed+k,0);}}
}
function house(mb,b,ry,s,seed){
  const wall=HOUSE[Math.floor(hash(seed,1)*HOUSE.length)],mw=M(wall,null,s,{w:0});
  boxR(mb,add(b,[0,1.4,0]),3.2,1.4,2.4,ry,mw);
  const cs=Math.cos(ry),sn=Math.sin(ry),P=(x,y,z)=>[b[0]+x*cs+z*sn,b[1]+y,b[2]-x*sn+z*cs],rm=M(COL.roof,null,s,{w:0});
  const A=P(-3.5,2.8,-2.7),B=P(3.5,2.8,-2.7),C=P(3.5,2.8,2.7),D=P(-3.5,2.8,2.7),E=P(-3.5,4.3,0),F=P(3.5,4.3,0);
  mb.quad(A,B,F,E,rm);mb.quad(D,E,F,C,rm);mb.tri(A,E,D,rm);mb.tri(B,C,F,rm);
  const fz=2.42;boxR(mb,P(-1.4,0.95,fz),0.5,0.95,0.04,ry,M(COL.door,null,s,{w:0}));
  boxR(mb,P(1.2,1.6,fz),0.6,0.45,0.04,ry,M(COL.win,null,s,{w:0,kind:3}));
}
function turbineTower(mb,b,h,s){tube(mb,b,add(b,[0,h,0]),0.9,0.45,10,M(COL.tower,null,s,{w:0}));boxR(mb,add(b,[0,h+0.4,-0.6]),0.7,0.7,1.8,0,M(COL.tower,null,s,{w:0}));boxR(mb,add(b,[0,h+0.4,-2.45]),0.18,0.18,0.12,0,M(COL.red,null,s,{w:0,kind:3}));}
function lighthouse(mb,b,s){const h=16,m=[M(COL.red,null,s,{w:0}),M(COL.tower,null,s,{w:0})];for(let k=0;k<6;k++){const y0=k*h/6,y1=(k+1)*h/6;tube(mb,add(b,[0,y0,0]),add(b,[0,y1,0]),1.6-k*0.12,1.6-(k+1)*0.12,10,m[k%2],k===5);}
  tube(mb,add(b,[0,h,0]),add(b,[0,h+1.6,0]),0.8,0.8,8,M(cc('#fff2b0'),null,s,{w:0,kind:3}));tube(mb,add(b,[0,h+1.6,0]),add(b,[0,h+2.8,0]),1.1,0.05,8,m[0]);}
function jangada(mb,b,s,seed){const k={w:0,kind:2},ry=hash(seed,1)*0.6;boxR(mb,add(b,[0,0.2,0]),0.7,0.2,2.6,ry,M(COL.hull,null,s,k));
  const mast=add(b,[0,0.4,0.3]);tube(mb,mast,add(mast,[0,5.5,0]),0.06,0.05,4,M(COL.hull,null,s,k));
  const sm=M(COL.sail,null,s,k);mb.tri(add(mast,[0,0.6,0]),add(mast,[0,5.4,0]),add(mast,[0.1,0.7,-3.2]),sm);
  mb.tri(add(mast,[0.01,2.6,0]),add(mast,[0.01,3.3,0]),add(mast,[0.11,2.7,-2.1]),M(hash(seed,2)>0.5?COL.red:cc('#2f86ff'),null,s,k));}

// ---- chunks
const CH=100,chunks=new Map(),turbines=[];
function genChunk(ci){
  const mb=new MB(),s0=ci*CH,s1=s0+CH,R=rng(ci*9973+17),tur=[];
  // terrain
  const ds=4;
  for(let s=s0;s<s1;s+=ds)for(let k=0;k<LAT.length-1;k++){
    const d0=LAT[k],d1=LAT[k+1];if(d0===-5.5&&d1===5.5)continue;
    const a=WP(s,d0),b=WP(s,d1),c=WP(s+ds,d1),e=WP(s+ds,d0);
    for(const[p,q,r]of[[a,b,c],[a,c,e]]){const n=norm(cross(sub(q,p),sub(r,p)));const cy=(p[1]+q[1]+r[1])/3,cd=(d0+d1)/2,cs=s+ds/2;
      mb.tri(p,q,r,groundMat(cs,cd,cy,Math.abs(n[1]),R()));}
  }
  // road
  const ra=M(COL.asphalt,null,0,{w:0});
  for(let s=s0;s<s1;s+=2){
    const y0=terr(s)+0.02,y1=terr(s+2)+0.02,x0=roadX(s),x1=roadX(s+2);
    const Q=(x,y,s2,d)=>[x+d,y,-s2];
    mb.quad(Q(x0,y0,s,-4.2),Q(x0,y0,s,4.2),Q(x1,y1,s+2,4.2),Q(x1,y1,s+2,-4.2),Object.assign({},ra,{s}));
    for(const sd of[-1,1])mb.quad(Q(x0,y0-0.01,s,sd*4.2),Q(x0,y0-0.01,s,sd*5.5),Q(x1,y1-0.01,s+2,sd*5.5),Q(x1,y1-0.01,s+2,sd*4.2),M(COL.shoulderD,COL.shoulderW,s,{w:0.8}));
    for(const d of[-3.7,3.7])mb.quad(Q(x0,y0+0.02,s,d-0.08),Q(x0,y0+0.02,s,d+0.08),Q(x1,y1+0.02,s+2,d+0.08),Q(x1,y1+0.02,s+2,d-0.08),M(COL.white,null,s,{w:0}));
    if(Math.floor(s/2)%3===0){const s2=s+3>s1?s1:s+3,x2=roadX(s2),y2=terr(s2)+0.02;mb.quad(Q(x0,y0+0.02,s,-0.08),Q(x0,y0+0.02,s,0.08),Q(x2,y2+0.02,s2,0.08),Q(x2,y2+0.02,s2,-0.08),M(COL.yellow,null,s,{w:0}));}
    // stepped curb down to the terrain
    for(const sd of[-1,1]){const g0=groundY(s,sd*5.5),g1=groundY(s+2,sd*5.5);mb.quad(Q(x0,y0,s,sd*5.5),Q(x1,y1,s+2,sd*5.5),Q(x1,g1-0.3,s+2,sd*5.6),Q(x0,g0-0.3,s,sd*5.6),M(COL.shoulderD,COL.shoulderW,s));}
  }
  // vegetation on the right (caatinga/backcountry or coast)
  for(let k=0;k<64;k++){
    const s=s0+R()*CH,d=7+Math.pow(R(),1.6)*120,seed=ci*1000+k,b=WP(s,d),bio=biomeAt(s),r=R(),coast=R()>bio;
    if(coast){if(r<0.35)carnauba(mb,b,8+R()*3,s,seed);else if(r<0.55)caju(mb,b,3.5+R()*1.5,s,seed);else if(r<0.88)shrub(mb,b,1.1+R()*0.8,s,seed);else rock(mb,b,0.6+R()*0.8,s,seed);}
    else{if(r<0.25)ipe(mb,b,5+R()*2.5,s,seed);else if(r<0.55)mandacaru(mb,b,2.6+R()*2.2,s,seed);else if(r<0.88)shrub(mb,b,1.1+R()*0.8,s,seed);else xique(mb,b,0.8+R()*0.5,s,seed);}
  }
  // cliff plateau on the left (coast)
  for(let k=0;k<26;k++){
    const s=s0+R()*CH,d=-(8+R()*(cliffEdge(s)-12)),seed=ci*1000+200+k,b=WP(s,d),r=R();
    if(r<0.45)carnauba(mb,b,8+R()*3.5,s,seed);else if(r<0.65)caju(mb,b,3.5+R()*1.5,s,seed);else shrub(mb,b,1+R()*0.7,s,seed);
  }
  // grass and flowers along the road
  for(let k=0;k<260;k++){
    const side=R()<0.5?-1:1,s=s0+R()*CH,d=side*(5.7+Math.pow(R(),1.4)*20),b=WP(s,d),h=0.25+R()*0.35,az=R()*TAU;
    for(let j=0;j<3;j++){const a2=az+j*2.1,base1=add(b,[Math.cos(a2)*0.06,0,Math.sin(a2)*0.06]),base2=add(b,[-Math.cos(a2)*0.06,0,-Math.sin(a2)*0.06]),tip=add(b,[Math.cos(a2+1)*0.15,h,Math.sin(a2+1)*0.15]);
      mb.tri(base1,base2,tip,M(COL.grassD,COL.grassW,s,{mode:2,anc:b}));}
    if(k%3===0){const f=add(b,[0,h*0.7,0]);const fc=[COL.ipe,COL.pink,COL.flowerW][k%9===0?2:(k%2)];blob(mb,f,0.09,0.06,0.09,M(fc,null,s,{mode:1,anc:f}),k,0.2);}
  }
  // wind turbines
  const nt=R()<0.8?2:1;for(let k=0;k<nt;k++){const s=s0+R()*CH,d=k===0?75+R()*130:110+R()*130;const b=WP(s,d);if(b[1]<SEA+1)continue;const h=36+R()*10;turbineTower(mb,b,h,s);tur.push({p:add(b,[0,h+0.4,-2.5]),r:R()*TAU,h});}
  // small house
  if(R()<0.55){const s=s0+R()*CH,d=11+R()*6;house(mb,WP(s,d),Math.PI/2+(R()-0.5)*0.3,s,ci);}
  // lighthouse and jangada rafts
  if(((ci%6)+6)%6===2){const s=s0+50;lighthouse(mb,WP(s,-cliffEdge(s)-14),s);}
  for(let k=0;k<3;k++){const s=s0+R()*CH,d=-(125+R()*220);jangada(mb,[roadX(s)+d,SEA,-s],s,ci*10+k);}
  const g=mb.upload();return{g,tur};
}
function ensureChunks(budget){
  const c0=Math.floor((st.dist-80)/CH),c1=Math.floor((st.dist+520)/CH);
  for(const[k,c]of chunks)if(k<c0){gl.deleteBuffer(c.g.buf);gl.deleteVertexArray(c.g.vao);chunks.delete(k);}
  for(let ci=c0;ci<=c1&&budget>0;ci++)if(!chunks.has(ci)){chunks.set(ci,genChunk(ci));budget--;}
}

// ---- unit meshes for dynamic parts
function unitMesh(build){const mb=new MB();build(mb);return mb.upload();}
const W0=M([1,1,1],null,0,{w:0});
const uCyl=unitMesh(mb=>tube(mb,[0,0,0],[0,1,0],1,1,10,W0));
const uSph=unitMesh(mb=>{const v=ICO.v,f=ICO.f;const mid=(a,b)=>norm(mul(add(a,b),0.5));for(const t of f){const a=v[t[0]],b=v[t[1]],c=v[t[2]],ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);mb.tri(a,ab,ca,W0);mb.tri(ab,b,bc,W0);mb.tri(ca,bc,c,W0);mb.tri(ab,bc,ca,W0);}});
const uBox=unitMesh(mb=>boxR(mb,[0,0,0],0.5,0.5,0.5,0,W0));
const uTorus=unitMesh(mb=>{const N=24,n=6,r=0.1;for(let i=0;i<N;i++)for(let j=0;j<n;j++){const P=(i,j)=>{const a=i/N*TAU,b=j/n*TAU;return[(1+r*Math.cos(b))*Math.cos(a),(1+r*Math.cos(b))*Math.sin(a),r*Math.sin(b)];};mb.quad(P(i,j),P(i+1,j),P(i+1,j+1),P(i,j+1),W0);}});
const uDisk=unitMesh(mb=>{const n=20;for(let k=0;k<n;k++){const a=k/n*TAU,b=(k+1)/n*TAU;mb.tri([0,0,0],[Math.cos(a),0,Math.sin(a)],[Math.cos(b),0,Math.sin(b)],W0);}});
const uRotor=unitMesh(mb=>{for(let k=0;k<3;k++){const a=k*TAU/3,d=[Math.cos(a),Math.sin(a),0],p=[-d[1],d[0],0];mb.quad(add([0,0,0],mul(p,0.9)),add(mul(d,18),mul(p,0.25)),add(mul(d,18),mul(p,-0.15)),mul(p,-0.6),W0);}blob(mb,[0,0,0],0.8,0.8,1.2,W0,0,0);});
function smoothSphere(mb,sub){let tr=ICO.f.map(f=>[ICO.v[f[0]],ICO.v[f[1]],ICO.v[f[2]]]);const mid=(a,b)=>norm(mul(add(a,b),0.5));for(let k=0;k<sub;k++){const nt=[];for(const[a,b,c]of tr){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);nt.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);}tr=nt;}for(const[a,b,c]of tr)mb.triN(a,b,c,a,b,c,W0);}
const uSphS=unitMesh(mb=>smoothSphere(mb,2));
function taper(mb,k,n=14){const P=(a,y,r)=>[Math.cos(a)*r,y,Math.sin(a)*r],N=a=>norm([Math.cos(a),(1-k)*0.5,Math.sin(a)]);for(let i=0;i<n;i++){const a0=i/n*TAU,a1=(i+1)/n*TAU;mb.triN(P(a0,0,1),P(a1,0,1),P(a1,1,k),N(a0),N(a1),N(a1),W0);mb.triN(P(a0,0,1),P(a1,1,k),P(a0,1,k),N(a0),N(a1),N(a0),W0);}}
const uCylS=unitMesh(mb=>taper(mb,1)),uTap75=unitMesh(mb=>taper(mb,0.75)),uTap55=unitMesh(mb=>taper(mb,0.55));
const uTorusS=unitMesh(mb=>{const N=32,n=10,r=0.1,P=(i,j)=>{const a=i/N*TAU,b=j/n*TAU;return[(1+r*Math.cos(b))*Math.cos(a),(1+r*Math.cos(b))*Math.sin(a),r*Math.sin(b)];},Q=(i,j)=>{const a=i/N*TAU,b=j/n*TAU;return[Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)];};for(let i=0;i<N;i++)for(let j=0;j<n;j++){mb.triN(P(i,j),P(i+1,j),P(i+1,j+1),Q(i,j),Q(i+1,j),Q(i+1,j+1),W0);mb.triN(P(i,j),P(i+1,j+1),P(i,j+1),Q(i,j),Q(i+1,j+1),Q(i,j+1),W0);}});
const uRim=unitMesh(mb=>{const N=36,ri=0.72;for(let i=0;i<N;i++){const a0=i/N*TAU,a1=(i+1)/N*TAU,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);for(const z of[-0.5,0.5]){const nz=[0,0,Math.sign(z)];mb.triN([c0*ri,s0*ri,z],[c0,s0,z],[c1,s1,z],nz,nz,nz,W0);mb.triN([c0*ri,s0*ri,z],[c1,s1,z],[c1*ri,s1*ri,z],nz,nz,nz,W0);}const o0=[c0,s0,0],o1=[c1,s1,0];mb.triN([c0,s0,-0.5],[c1,s1,-0.5],[c1,s1,0.5],o0,o1,o1,W0);mb.triN([c0,s0,-0.5],[c1,s1,0.5],[c0,s0,0.5],o0,o1,o0,W0);}});
const uSea=unitMesh(mb=>{const m=M(COL.sea,null,0,{w:0,kind:1});mb.quad([-3500,SEA,400],[60,SEA,400],[60,SEA,-2200],[-3500,SEA,-2200],m);});

// ================= state and physics
const st={dist:160,v:8.5,P:190,cad:86,hr:118,crank:0,wheel:0,boost:0,sprint:0,p:0.08,effort:0.2,gBloom:0.15,lastInput:-99,cam:Math.max(0,CAM_IDS.indexOf(OPT.camera)),sprV:0,surge:0,rockPh:0,stand:0,stV:0,standOn:false};st.p=OPT.timeOfDay;const startDist=st.dist;
const EXT={power:null,cadence:null,speed:null,sprint:null,dist:null,distT:0};
// [Argus app] course origin: scene s = origin + distance reported by the app (m)
let origin=st.dist,originLocked=false;
let T=0,rawDt=0,lastMeter=Math.floor(st.dist);
let FTP=OPT.ftp;
// [Argus app] stopped pose: below STAND_ON m/s the rider puts the left foot on the ground
const STAND_ON=0.45,STAND_OFF=0.9,STAND_LEAN=0.15,CRANK_READY=-0.75;
const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
const standEnv=()=>st.stand*st.stand*(3-2*st.stand);
function zone(P){const r=P/FTP;if(r<.55)return['Z1','Recuperação','#9aa4b2'];if(r<.75)return['Z2','Resistência','#4f9dff'];if(r<.9)return['Z3','Tempo','#3fd08a'];if(r<1.05)return['Z4','Limiar','#ffd23d'];if(r<1.2)return['Z5','VO₂máx','#ff8c3a'];return['Z6','Anaeróbico','#ff4d5e'];}
// initial trail already in bloom, so the scene does not open all dry
for(let m=lastMeter-300;m<=lastMeter;m++){const e=0.12+0.55*Math.max(0,Math.sin(m/37));setBloom(m,e,-10);}
for(let m=lastMeter+1;m<lastMeter+2100;m++)setBloom(m,-1,0);
function update(dt){
  T+=dt;if(OPT.dayCycleSeconds>0)st.p=(st.p+dt/OPT.dayCycleSeconds)%1;
  const gr=terrD(st.dist),auto=OPT.demo&&T-st.lastInput>18,cyc=T%30;
  st.surge=auto?smooth(21,22.6,cyc)*(1-smooth(27,28.6,cyc)):0;
  if(EXT.power!=null)st.P+=(EXT.power-st.P)*(1-Math.exp(-dt*6));
  else{let target=188+clamp(gr,-0.08,0.1)*1500+st.surge*300+st.boost*440+12*Math.sin(T*1.7)+8*Math.sin(T*3.1+1);target=clamp(target,45,1150);st.P+=(target-st.P)*(1-Math.exp(-dt*3.2));}
  if(EXT.speed!=null)st.v+=(Math.max(0,EXT.speed/3.6)-st.v)*(1-Math.exp(-dt*4));
  else{const m=OPT.riderMass,g=9.81,th=Math.atan(gr),F=m*g*(0.004*Math.cos(th)+Math.sin(th))+0.5*1.2*0.3*st.v*st.v;st.v=clamp(st.v+((st.P*0.97/Math.max(st.v,2))-F)/m*dt,0.5,22);}
  if(EXT.dist!=null){
    // [Argus app] follows the app's distance like the StateInterpolator: extrapolates with the
    // speed and closes the error gradually, never moving backwards; large jumps re-anchor or teleport.
    // Uses real time (not the dt capped at 50 ms): at low FPS the rider does not fall behind the
    // telemetry or the ghost, which follows the race clock.
    const age=performance.now()/1000-EXT.distT,target=origin+EXT.dist+st.v*Math.min(age,2.5),err=target-st.dist;
    if(Math.abs(err)>40){if(originLocked){st.dist=target;jumped=true;}else origin+=-err;}
    else st.dist+=Math.max(0,st.v*rawDt+err*(1-Math.exp(-1.2*rawDt)));
  }else st.dist+=st.v*dt;
  if(EXT.cadence!=null)st.cad+=(Math.max(0,EXT.cadence)-st.cad)*(1-Math.exp(-dt*5));
  else st.cad+=(clamp(70+(st.P-100)/9-Math.max(0,gr)*140,60,118)-st.cad)*(1-Math.exp(-dt*2));
  // [Argus app] the crank only picks up speed once the left foot is back on the pedal (both legs together)
  st.crank+=st.cad/60*TAU*dt*(1-standEnv());st.rockPh+=0.95*TAU*dt;st.wheel+=st.v*dt/0.335;
  const autoP=OPT.autoSprintFromPower?smooth(FTP*1.35,FTP*1.65,st.P):0;
  // [Argus app] stopped: left foot on the ground (hysteresis avoids flickering near 0 km/h).
  // Leaves the stopped pose as soon as the rider pedals (trainer speed ramps up slowly; cadence is immediate).
  const pedaling=(EXT.cadence!=null?EXT.cadence:st.cad)>5;
  if(st.standOn){if(pedaling||st.v>STAND_OFF)st.standOn=false;}else if(st.v<STAND_ON&&!pedaling)st.standOn=true;
  // back to the pedal faster than down to the ground
  {const w2=st.standOn?4.2:7.5;st.stV+=(w2*w2*((st.standOn?1:0)-st.stand)-2*w2*st.stV)*dt;st.stand=clamp(st.stand+st.stV*dt,0,1);}
  if(st.standOn&&st.cad<5)st.crank+=wrapA(CRANK_READY-st.crank)*(1-Math.exp(-dt*3));
  const tgt=(EXT.sprint!=null?(EXT.sprint?1:0):Math.max(st.boost,st.surge,autoP))*(1-st.stand),w=3.0;
  st.sprV+=(w*w*(tgt-st.sprint)-2*w*st.sprV)*dt;st.sprint=clamp(st.sprint+st.sprV*dt,0,1);
  st.effort+=(clamp((st.P-140)/280,0,1)-st.effort)*(1-Math.exp(-dt*5));
  if(st.dist<lastMeter)lastMeter=Math.floor(st.dist);else if(Math.floor(st.dist)-lastMeter>300)lastMeter=Math.floor(st.dist)-300;
  while(lastMeter<Math.floor(st.dist)){lastMeter++;const b=Math.max(0.06,st.effort);setBloom(lastMeter,b,T);setBloom(lastMeter+2048,-1,0);
    if(OPT.petals&&b>0.5&&Math.random()<0.5)burst(lastMeter,3+Math.round(b*5));}
}

// ================= sky and light
const SKY=[[0,'#1c2150','#5b4a8c','#e98a73'],[0.07,'#3a6fbf','#f0a27a','#ffd29a'],[0.16,'#2f7fd8','#79bdf0','#d6efff'],[0.5,'#2b78d2','#7fbdeb','#e8f4ff'],[0.6,'#3b3f8a','#e0677a','#ffb35c'],[0.68,'#161a45','#3f3474','#b65f6e'],[0.78,'#050817','#0b1233','#1b2550'],[0.9,'#050817','#0b1233','#1b2550'],[1,'#1c2150','#5b4a8c','#e98a73']].map(k=>[k[0],cc(k[1]),cc(k[2]),cc(k[3])]);
function skyAt(p){for(let i=0;i<SKY.length-1;i++){const a=SKY[i],b=SKY[i+1];if(p>=a[0]&&p<=b[0]){const t=smooth(a[0],b[0],p);return[mix3(a[1],b[1],t),mix3(a[2],b[2],t),mix3(a[3],b[3],t)];}}return[SKY[0][1],SKY[0][2],SKY[0][3]];}
function nightAt(p){if(p<0.1)return lerp(0.65,0,smooth(0,0.1,p));if(p<0.55)return 0;if(p<0.75)return smooth(0.55,0.75,p);if(p<0.88)return 1;return lerp(1,0.65,smooth(0.88,1,p));}
const bump=(p,c,w)=>{const d=Math.abs(p-c);return d>w?0:smooth(0,1,1-d/w);};
function hourAt(p){const K=[[0,5],[0.1,6.8],[0.5,16.6],[0.64,18.7],[0.92,28.2],[1,29]];for(let i=0;i<K.length-1;i++)if(p<=K[i+1][0])return(lerp(K[i][1],K[i+1][1],(p-K[i][0])/(K[i+1][0]-K[i][0])))%24;return 5;}
function phaseName(h){if(h>=4.5&&h<6.9)return'Aurora';if(h<12&&h>=6.9)return'Manhã';if(h>=12&&h<16.2)return'Tarde';if(h>=16.2&&h<18.8)return'Pôr do sol';if(h>=3.5&&h<4.5)return'Madrugada';return'Noite estrelada';}
let L={};
function lighting(){
  const p=st.p,night=nightAt(p),warm=bump(p,0.065,0.08)+bump(p,0.6,0.08),[top,mid,hor]=skyAt(p);
  const u=clamp((p-0.03)/0.61,0,1),e=Math.sin(Math.PI*u)*1.15-0.04;
  const sunDir=norm([-0.45,Math.sin(e),Math.cos(Math.PI*u)*1.0]);
  const um=clamp((p-0.65)/0.38,0,1),em=Math.sin(Math.PI*um)*0.9;
  const moonDir=norm([0.35,Math.sin(em)+0.02,-Math.cos(Math.PI*um)]);
  const sunUp=smooth(-0.05,0.08,sunDir[1])*(1-night);
  const sunC=mix3([1.12,1.06,0.96],[1.25,0.72,0.42],clamp(warm,0,1));
  const moonC=[0.22,0.27,0.42];
  L={night,warm,top,mid,hor,sunDir:sunUp>0.02?sunDir:moonDir,lightC:mix3(moonC,sunC,sunUp),sunRaw:sunDir,moonDir,sunVis:sunUp,moonVis:smooth(0.3,0.8,night),
     skyAmb:mix3([0.12,0.15,0.3],mix3([0.5,0.6,0.78],[0.62,0.5,0.55],clamp(warm,0,1)),1-night),gndAmb:mix3([0.06,0.06,0.1],[0.42,0.36,0.28],1-night),
     fog:mix3(hor,mid,0.15),sunC};
}

// ================= rider (IK in the bike plane)
function ik(h,p,a,b,dir){const dx=p[0]-h[0],dy=p[1]-h[1];let d=Math.hypot(dx,dy);d=clamp(d,Math.abs(a-b)+1e-3,a+b-1e-3);const base=Math.atan2(dy,dx),an=Math.acos(clamp((a*a+d*d-b*b)/(2*a*d),-1,1)),k=base+dir*an;return[h[0]+Math.cos(k)*a,h[1]+Math.sin(k)*a];}
let bikeM=ID,bikeBasis=null,camBasis=null;
const RIDER_D=1.7,GHOST_D=-0.9;
function bikeFrame(d=RIDER_D){
  const s=st.dist,p=[roadX(s)+d,terr(s)+0.02,-s];
  const fwd=norm([roadXD(s),terrD(s),-1]),right=norm(cross(fwd,[0,1,0])),up=cross(right,fwd);
  const env=st.sprint*st.sprint*(3-2*st.sprint),roll=env*0.115*Math.sin(st.rockPh)+(1-env)*0.003*Math.sin(st.crank)+STAND_LEAN*standEnv();
  const c=Math.cos(roll),sn=Math.sin(roll),r2=add(mul(right,c),mul(up,sn)),u2=sub(mul(up,c),mul(right,sn));
  bikeBasis={p,fwd,right:r2,up:u2};camBasis={p,fwd,right,up};bikeM=M4.basis(fwd,u2,r2,p);
}
const BL=(x,y,z)=>{const b=bikeBasis;return add(b.p,add(mul(b.fwd,x),add(mul(b.up,y),mul(b.right,z))));};
const lerp3=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
function segM(a,b,r,r2){const y=sub(b,a),L2=len(y),yn=mul(y,1/(L2||1)),[u,v]=perp(yn);return M4.basis(mul(u,r),y,mul(v,r2===undefined?r:r2),a);}
const RC={acc:cc('#f3f1ec'),accent:cc('#f3f1ec'),white:cc('#f4f6fa'),frame:cc('#f3f1ec'),tire:cc('#18191d'),rim:cc('#121316'),dark:cc('#1c1f26'),spoke:cc('#2a2d33'),metal:cc('#a9b0b9'),ring:cc('#2b2e34'),chain:cc('#7b818a')};
const parts=[];
function part(mesh,m,col,spec=0.3,emis=0,alpha=1){parts.push({mesh,m,col,spec,emis,alpha});}
function partMat(pt){const metal=(pt.col===RC.metal||pt.col===RC.chain||pt.col===RC.ring)?0.9:0;return[clamp(0.88-0.7*pt.spec,0.12,0.9),metal,0];}

// ---------------- bicycle
const uGear=unitMesh(mb=>{const N=52,ri=0.8,P=(a,r,z)=>[Math.cos(a)*r,Math.sin(a)*r,z];
  for(let i=0;i<N;i++){const a0=i/N*TAU,a1=(i+1)/N*TAU,d=(a1-a0)*0.22;
    for(const z of[-0.5,0.5]){const nz=[0,0,Math.sign(z)];mb.triN(P(a0,ri,z),P(a0,1,z),P(a1,1,z),nz,nz,nz,W0);mb.triN(P(a0,ri,z),P(a1,1,z),P(a1,ri,z),nz,nz,nz,W0);
      if(i%2===0){mb.triN(P(a0,1,z),P(a0+d,1.075,z),P(a1-d,1.075,z),nz,nz,nz,W0);mb.triN(P(a0,1,z),P(a1-d,1.075,z),P(a1,1,z),nz,nz,nz,W0);}}
    const o0=[Math.cos(a0),Math.sin(a0),0],o1=[Math.cos(a1),Math.sin(a1),0];const r1=i%2===0?1.075:1;mb.triN(P(a0,r1,-0.5),P(a1,r1,-0.5),P(a1,r1,0.5),o0,o1,o1,W0);mb.triN(P(a0,r1,-0.5),P(a1,r1,0.5),P(a0,r1,0.5),o0,o1,o0,W0);}});
const BK={BB:[0,0.29],R:[-0.42,0.335],F:[0.61,0.335],S:[-0.149,0.77],SS:[-0.121,0.68],HB:[0.49,0.74],HT:[0.465,0.86],post:[-0.216,0.985]};
function buildRider(lat=RIDER_D,target=bodyGL){
  parts.length=0;bikeFrame(lat);
  const b=bikeBasis,Bp=(x,y,z=0)=>BL(x,y,z);
  const E=(c,ax,ay,az)=>M4.basis(mul(b.fwd,ax),mul(b.up,ay),mul(b.right,az),c);
  const aeroT=(mesh,a,c,rIn,rSide,col,spec=0.92)=>{const y=sub(c,a),x=norm(cross(norm(y),b.right));part(mesh,M4.basis(mul(x,rIn),y,mul(b.right,rSide),a),col,spec);};
  const cap=(a,c,r,col,spec=0.4,mesh=uCylS)=>part(mesh,segM(a,c,r),col,spec);
  const ball=(c,r,col,spec=0.92)=>part(uSphS,M4.basis([r,0,0],[0,r,0],[0,0,r],c),col,spec);
  const local=(x,y,z,rot,sx,sy,sz)=>M4.mul(bikeM,M4.mul(M4.T(x,y,z),M4.mul(M4.RZ(rot),M4.S(sx,sy,sz))));
  const{BB,R,F,S,SS,HB,HT,post}=BK,fr=RC.frame,crA=-st.crank;
  // wheels (black rims and spokes)
  for(const[c,off]of[[R,0],[F,0.6]]){
    const base=M4.mul(bikeM,M4.mul(M4.T(c[0],c[1],0),M4.RZ(-st.wheel+off)));
    part(uTorusS,M4.mul(base,M4.S(0.318,0.318,0.3)),RC.tire,0.15);
    part(uRim,M4.mul(base,M4.S(0.3,0.3,0.03)),RC.rim,0.85);
    for(let k=0;k<12;k++){const a=k*TAU/12;part(uCyl,M4.mul(base,M4.mul(M4.RZ(a),M4.mul(M4.T(0,0,k%2?0.012:-0.012),M4.S(0.0032,0.22,0.0032)))),RC.spoke,0.5);}
    part(uCylS,M4.mul(base,M4.mul(M4.basis([1,0,0],[0,0,1],[0,-1,0],[0,0,-0.06]),M4.S(0.024,0.12,0.024))),RC.rim,0.6);
  }
  // frame: tapered tubes with rounded joints
  aeroT(uTap75,Bp(...BB),Bp(...HB),0.037,0.025,fr);
  aeroT(uTap75,Bp(...HT),Bp(...S),0.025,0.019,fr);
  aeroT(uCylS,Bp(...BB),Bp(...S),0.026,0.02,fr);
  part(uTap75,segM(Bp(HB[0],HB[1]),Bp(HT[0],HT[1]),0.029,0.026),fr,0.92);
  ball(Bp(HB[0]+0.002,HB[1]-0.002),0.026,fr);part(uSphS,E(Bp(...S),0.024,0.02,0.019),fr,0.92);
  part(uCylS,M4.mul(bikeM,M4.mul(M4.basis([1,0,0],[0,0,1],[0,-1,0],[BB[0],BB[1],-0.046]),M4.S(0.03,0.092,0.03))),fr,0.92);
  for(const s of[-1,1]){
    const cs0=Bp(BB[0]-0.01,BB[1]+0.005,0.045*s),cs1=Bp(-0.21,0.315,0.063*s),cs2=Bp(R[0]+0.012,R[1]+0.004,0.064*s);
    part(uTap75,segM(cs0,cs1,0.017,0.014),fr,0.92);part(uTap75,segM(cs1,cs2,0.0128,0.011),fr,0.92);ball(cs1,0.0135,fr);
    const ss0=Bp(SS[0],SS[1],0.026*s),ss2=Bp(R[0]+0.014,R[1]+0.014,0.064*s);part(uTap75,segM(ss0,ss2,0.011,0.009),fr,0.92);
    part(uBox,E(Bp(R[0]+0.008,R[1]+0.004,0.066*s),0.03,0.024,0.006),fr,0.9);
    const f0=Bp(HB[0]+0.006,HB[1]-0.03,0.045*s),f1=Bp(0.565,0.52,0.052*s),f2=Bp(F[0]-0.004,F[1]+0.006,0.056*s);
    part(uTap75,segM(f0,f1,0.017,0.015),fr,0.92);part(uTap75,segM(f1,f2,0.0128,0.011),fr,0.92);ball(f1,0.0132,fr);
    part(uBox,E(Bp(F[0],F[1]+0.006,0.058*s),0.024,0.022,0.006),fr,0.9);
  }
  part(uSphS,E(Bp(HB[0]+0.004,HB[1]-0.026),0.03,0.016,0.054),fr,0.92);
  // seatpost, saddle
  cap(Bp(...S),Bp(...post),0.0135,RC.dark,0.6);
  part(uSphS,E(Bp(-0.25,0.996),0.12,0.016,0.068),RC.dark,0.5);part(uSphS,E(Bp(-0.145,0.993),0.08,0.013,0.024),RC.dark,0.5);
  // headset, stem, handlebar and levers
  cap(Bp(HT[0],HT[1]),Bp(0.46,0.885),0.02,RC.dark,0.6);cap(Bp(0.46,0.885),Bp(0.6,0.935),0.017,RC.dark,0.6);
  cap(Bp(0.6,0.935,-0.21),Bp(0.6,0.935,0.21),0.014,RC.dark,0.5);
  for(const z of[-0.2,0.2]){
    cap(Bp(0.6,0.935,z),Bp(0.655,0.94,z),0.014,RC.dark,0.5);
    part(uSphS,E(Bp(0.677,0.94,z),0.046,0.019,0.019),RC.dark,0.45);part(uSphS,E(Bp(0.716,0.951,z),0.014,0.016,0.014),RC.dark,0.45);
    cap(Bp(0.712,0.93,z),Bp(0.705,0.84,z),0.008,cc('#2c3038'),0.7);
    cap(Bp(0.655,0.94,z),Bp(0.672,0.88,z),0.014,RC.dark,0.5);cap(Bp(0.672,0.88,z),Bp(0.655,0.83,z),0.014,RC.dark,0.5);cap(Bp(0.655,0.83,z),Bp(0.6,0.815,z),0.014,RC.dark,0.5);
    ball(Bp(0.672,0.88,z),0.014,RC.dark,0.5);ball(Bp(0.655,0.83,z),0.014,RC.dark,0.5);
  }
  cap(Bp(0.6,0.935),Bp(0.665,0.938),0.008,RC.dark,0.6);
  part(uBox,E(Bp(0.69,0.94),0.085,0.02,0.055),RC.dark,0.6);part(uBox,E(Bp(0.692,0.951),0.068,0.004,0.044),cc(zone(st.P)[2]),0,1);
  // brakes
  part(uSphS,E(Bp(0.535,0.71),0.016,0.022,0.05),RC.dark,0.6);
  // water bottle
  cap(Bp(0.12,0.47),Bp(0.27,0.6),0.036,RC.white,0.7);cap(Bp(0.27,0.6),Bp(0.291,0.618),0.018,RC.dark,0.5);
  // ---- drivetrain: double chainring, cranks, pedals, cassette, chain and derailleurs
  part(uGear,local(BB[0],BB[1],0.08,crA,0.107,0.107,0.0045),RC.ring,0.75);
  part(uGear,local(BB[0],BB[1],0.071,crA,0.081,0.081,0.0045),RC.ring,0.75);
  for(let k=0;k<4;k++)part(uBox,M4.mul(bikeM,M4.mul(M4.T(BB[0],BB[1],0.076),M4.mul(M4.RZ(crA+k*Math.PI/2+0.4),M4.mul(M4.T(0.046,0,0),M4.S(0.088,0.018,0.007))))),RC.dark,0.7);
  for(const s of[-1,1]){const a=crA+(s<0?Math.PI:0),p=[BB[0]+Math.cos(a)*0.17,BB[1]+Math.sin(a)*0.17];
    aeroT(uTap75,Bp(BB[0],BB[1],0.09*s),Bp(p[0],p[1],0.096*s),0.021,0.0095,RC.dark,0.8);ball(Bp(BB[0],BB[1],0.09*s),0.02,RC.dark,0.8);
    part(uBox,E(Bp(p[0]+0.005,p[1]-0.008,0.118*s),0.09,0.014,0.072),RC.dark,0.5);}
  const cogs=8;for(let k=0;k<cogs;k++){const r=lerp(0.054,0.027,k/(cogs-1));part(uGear,local(R[0],R[1],0.028+k*0.0043,-st.wheel,r,r,0.0022),RC.metal,0.9);}
  const zc=0.045,ring=[BB[0],BB[1]],Up=[R[0]+0.012,R[1]-0.05],Lp=[R[0]+0.032,R[1]-0.108];
  const runs=[[[ring[0],ring[1]+0.11,0.08],[R[0],R[1]+0.045,zc]],[[ring[0],ring[1]-0.11,0.08],[Lp[0]+0.004,Lp[1]-0.019,0.056]],[[Lp[0]-0.018,Lp[1],0.056],[Up[0]-0.017,Up[1],0.054]],[[Up[0]-0.014,Up[1]+0.01,0.054],[R[0]-0.03,R[1]-0.035,zc]]];
  const pitch=0.0254,shift=((st.crank*0.107)%pitch+pitch)%pitch;
  runs.forEach(([a,c],ri)=>{const A=Bp(...a),Cq=Bp(...c),d=sub(Cq,A),Ln=len(d),dn=mul(d,1/Ln),nn=norm(cross(b.right,dn)),n=Math.floor(Ln/pitch);
    for(let k=0;k<=n;k++){const t=((k*pitch+(ri===0?-shift:shift))%Ln+Ln)%Ln;part(uBox,M4.basis(mul(dn,0.022),mul(nn,0.0075),mul(b.right,0.0075),add(A,mul(dn,t))),k%2?RC.chain:RC.dark,0.85);}});
  part(uSphS,E(Bp(R[0]+0.024,R[1]-0.025,0.062),0.03,0.02,0.012),RC.dark,0.6);
  aeroT(uCylS,Bp(Up[0],Up[1],0.062),Bp(Lp[0],Lp[1],0.062),0.014,0.003,RC.dark,0.7);
  part(uGear,local(Up[0],Up[1],0.055,-st.wheel*3,0.016,0.016,0.006),RC.chain,0.8);part(uGear,local(Lp[0],Lp[1],0.055,-st.wheel*3,0.016,0.016,0.006),RC.chain,0.8);
  part(uSphS,E(Bp(-0.052,0.43,0.07),0.04,0.012,0.011),RC.dark,0.7);part(uCylS,segM(Bp(-0.052,0.43,0.02),Bp(-0.052,0.43,0.064),0.006),RC.dark,0.6);
  // lights
  const n=L.night,on=Math.sin(T*11)>0;
  part(uSphS,E(Bp(0.7,0.91),0.03,0.022,0.025),n>0.15?[1,0.97,0.85]:cc('#d0d4da'),0.8,n>0.15?1:0);
  part(uSphS,E(Bp(-0.212,0.9),0.02,0.028,0.022),on&&n>0.1?[1,0.15,0.2]:cc('#7a1a20'),0.6,on&&n>0.1?1:0);
  part(uDisk,M4.mul(M4.T(...Bp(0.08,0.012,0)),M4.basis(mul(b.fwd,0.9),mul(b.up,1),mul(b.right,0.32),[0,0,0])),[0,0,0],0,1,0.16*(0.4+0.6*(1-n)));
  buildBody(target);
}

// ================= rider body: continuous mesh generated from anatomical cross-sections
// Reference: 1.78 m / 70 kg athlete. Bike coordinates: x forward, y up, z right (meters).
const DEG=Math.PI/180;
const gss=(x,c,w)=>{const d=(x-c)/w;return Math.exp(-d*d);};
function curveP(p,u){if(u<=p[0][0])return p[0][1];for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1];if(u<=b[0]){const t=(u-a[0])/(b[0]-a[0]),s=t*t*(3-2*t);return a[1]+(b[1]-a[1])*s;}}return p[p.length-1][1];}
function sell(a,b,th,n){const c=Math.abs(Math.cos(th))/a,s=Math.abs(Math.sin(th))/b;return Math.pow(Math.pow(c,n)+Math.pow(s,n),-1/n);}
function ik3(a,b,l1,l2,pole){const d=sub(b,a),dl=len(d)||1e-4,dd=clamp(dl,Math.abs(l1-l2)+1e-3,l1+l2-1e-4),dir=mul(d,1/dl);const x=(l1*l1-l2*l2+dd*dd)/(2*dd),h=Math.sqrt(Math.max(l1*l1-x*x,0));const pv=norm(sub(pole,mul(dir,dot(pole,dir))));return add(a,add(mul(dir,x),mul(pv,h)));}
function chainAt(pts,u,rr){
  const n=pts.length,Ls=[];let L=0;for(let i=0;i<n-1;i++){const l=len(sub(pts[i+1],pts[i]))||1e-5;Ls.push(l);L+=l;}
  const s=u*L;let cj=0;
  for(let j=1;j<n-1;j++){cj+=Ls[j-1];const r=Math.min(rr,Ls[j-1]*0.45,Ls[j]*0.45);
    if(s>cj-r&&s<cj+r){const P0=add(pts[j],mul(norm(sub(pts[j-1],pts[j])),r)),P2=add(pts[j],mul(norm(sub(pts[j+1],pts[j])),r)),t=(s-(cj-r))/(2*r);
      return{c:add(add(mul(P0,(1-t)*(1-t)),mul(pts[j],2*(1-t)*t)),mul(P2,t*t)),T:norm(add(mul(sub(pts[j],P0),2*(1-t)),mul(sub(P2,pts[j]),2*t))),s,L};}}
  let acc=0;for(let i=0;i<n-1;i++){if(s<=acc+Ls[i]||i===n-2){const t=clamp((s-acc)/Ls[i],0,1);return{c:lerp3(pts[i],pts[i+1],t),T:norm(sub(pts[i+1],pts[i])),s,L};}acc+=Ls[i];}
}
const BODY={nv:0,idxT:[],idxC:[],parts:[]};
function addPart(nr,ns,matFn,capS=true,capE=true){
  const p={nr,ns,base:BODY.nv,matFn};BODY.nv+=nr*ns+2;const b=p.base;
  for(let r=0;r<nr-1;r++)for(let s=0;s<ns;s++){const s2=(s+1)%ns,a=b+r*ns+s,q=b+r*ns+s2,c=b+(r+1)*ns+s2,d=b+(r+1)*ns+s;BODY.idxT.push(a,q,c,a,c,d);}
  const cs=b+nr*ns,ce=cs+1;
  if(capS)for(let s=0;s<ns;s++)BODY.idxC.push(cs,b+(s+1)%ns,b+s);
  if(capE)for(let s=0;s<ns;s++){const o=b+(nr-1)*ns;BODY.idxC.push(ce,o+s,o+(s+1)%ns);}
  BODY.parts.push(p);return p;
}
const CB={jersey:cc('#f3f5f8'),dark:cc('#14264f'),yellow:cc('#14264f'),white:cc('#1b3266'),bib:cc('#15181f'),skin:cc('#a46b48'),hair:cc('#241a15'),sock:cc('#f2f3f6'),glove:cc('#262a31'),shoe:cc('#eef0f3'),sole:cc('#1b1d22'),helmet:cc('#f6f7f9'),lens:cc('#5b4dff'),strap:cc('#1c1f26')};
const MT={jersey:[0.62,0,2],bib:[0.4,0,2],skin:[0.52,0,1],glove:[0.75,0,2],shoe:[0.3,0,0],sole:[0.65,0,0],helmet:[0.2,0,0],lens:[0.07,0.9,0],strap:[0.6,0,0],hair:[0.85,0,0]};
const mk=(c,m)=>[c,m];
function matTorso(u,th){const c=Math.cos(th),sa=Math.abs(Math.sin(th));
  if(u<0.2)return mk(CB.bib,MT.bib);if(u>=0.86)return mk(CB.skin,MT.skin);if(u>=0.83)return mk(CB.dark,MT.jersey);
  if(c>0.975&&u>0.45)return mk(mix3(CB.dark,CB.jersey,0.35),MT.jersey);
  if(u>0.76&&c<0.3)return mk(CB.dark,MT.jersey);
  if(u>=0.33&&u<=0.365&&c<0.15)return mk(CB.yellow,MT.jersey);
  return mk(CB.jersey,MT.jersey);}
function matLeg(u){if(u<0.466)return mk(CB.bib,MT.bib);if(u>0.855)return mk(CB.sock,MT.jersey);return mk(CB.skin,MT.skin);}
function matArm(u){if(u<0.31)return mk(CB.jersey,MT.jersey);if(u<0.345)return mk(CB.yellow,MT.jersey);return mk(CB.skin,MT.skin);}
function matHand(){return mk(CB.glove,MT.glove);}
function matGlove(){return mk(CB.glove,MT.glove);}
function matShoe(u,th){return mk(Math.cos(th)<-0.72?mix3(CB.shoe,[0.8,0.8,0.82],0.35):CB.shoe,MT.shoe);}
function matHead(u,th){const y=Math.cos(u*Math.PI);if(Math.cos(th)<-0.3&&y<0.2&&y>-0.55)return mk(CB.hair,MT.hair);return mk(CB.skin,MT.skin);}
const helmetPhi=(u,th)=>0.02+u*lerp(0.4*Math.PI,0.62*Math.PI,smooth(0.55,-0.5,Math.cos(th)));
const HVENTS=[[0,0.66,0.11,0.17],[0.33,0.58,0.1,0.18],[-0.33,0.58,0.1,0.18],
  [0,0.08,0.085,0.3],[0.3,0.08,0.085,0.32],[-0.3,0.08,0.085,0.32],[0.58,0.02,0.07,0.28],[-0.58,0.02,0.07,0.28],
  [0,-0.6,0.08,0.17],[0.31,-0.55,0.08,0.18],[-0.31,-0.55,0.08,0.18],[0.83,0.18,0.06,0.22],[-0.83,0.18,0.06,0.22]];
function helmetFeat(u,th){const ph=helmetPhi(u,th),y=Math.cos(ph),sp=Math.sin(ph),ct=Math.cos(th),lat=Math.sin(th)*sp,lon=ct*sp;let d=0,g=0;
  if(y>0.12)for(const v of HVENTS){const a=(lat-v[0])/v[2],b=(lon-v[1])/v[3],q=a*a+b*b;if(q<1){d=-0.013*Math.sqrt(1-q)-0.003;g=1;break;}}
  if(u>0.86){g=2;d=0.003;}
  return[d,g];}
const helmetVent=(u,th)=>helmetFeat(u,th)[1]>0;
function matHelmet(u,th){const g=helmetFeat(u,th)[1];return g===1?mk(cc('#121317'),[0.75,0,0]):g===2?mk(cc('#17181c'),[0.45,0,0]):mk(CB.helmet,MT.helmet);}
function matHStrap(){return mk(cc('#16171b'),MT.strap);}
function matLens(u,th){return Math.cos(th)>0.75?mk(CB.strap,MT.strap):mk(CB.lens,MT.lens);}
function matStrap(){return mk(CB.strap,MT.strap);}
const PT={torso:addPart(46,30,matTorso),legR:addPart(44,22,matLeg),legL:addPart(44,22,matLeg),armR:addPart(36,16,matArm),armL:addPart(36,16,matArm),
  handR:addPart(18,14,matHand),handL:addPart(18,14,matHand),thumbR:addPart(8,8,matGlove),thumbL:addPart(8,8,matGlove),shoeR:addPart(22,18,matShoe),shoeL:addPart(22,18,matShoe),
  head:addPart(22,26,matHead),helmet:addPart(52,84,matHelmet,true,false),lens:addPart(16,8,matLens),tempR:addPart(6,6,matStrap),tempL:addPart(6,6,matStrap),strapR:addPart(10,6,matHStrap),strapL:addPart(10,6,matHStrap),strapR2:addPart(6,6,matHStrap),strapL2:addPart(6,6,matHStrap)};
const bodyGL=(()=>{
  const nv=BODY.nv;BODY.pos=new Float32Array(nv*3);BODY.nor=new Float32Array(nv*3);BODY.pn=new Float32Array(nv*6);
  const cm=new Float32Array(nv*8);cm.fill(-1);
  for(const p of BODY.parts){for(let r=0;r<p.nr;r++)for(let s=0;s<p.ns;s++){const u=r/(p.nr-1),th=s/p.ns*TAU,[c,m]=p.matFn(u,th),i=(p.base+r*p.ns+s)*8;cm.set(c,i);cm.set(m,i+3);if(p===PT.torso){cm[i+6]=u;cm[i+7]=th;}}
    const a=p.matFn(0,0),z=p.matFn(1,0),cs=(p.base+p.nr*p.ns)*8;cm.set(a[0],cs);cm.set(a[1],cs+3);cm.set(z[0],cs+8);cm.set(z[1],cs+11);}
  const idx=new Uint16Array(BODY.idxT.concat(BODY.idxC));
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,BODY.pn.byteLength,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
  const cb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,cb);gl.bufferData(gl.ARRAY_BUFFER,cm,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,3,gl.FLOAT,false,32,12);gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,2,gl.FLOAT,false,32,24);
  const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
  gl.bindVertexArray(null);return{vao,pb,cb,ib,n:idx.length};
})();
// [Argus app] second body mesh (ghost): same colors/indices, its own positions
function makeGhostGL(){const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,BODY.pn.byteLength,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);
  gl.bindBuffer(gl.ARRAY_BUFFER,bodyGL.cb);
  gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,3,gl.FLOAT,false,32,12);gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,2,gl.FLOAT,false,32,24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,bodyGL.ib);gl.bindVertexArray(null);return{vao,pb,n:bodyGL.n};}
function fillPart(p,ring){
  const P=BODY.pos;let first,second,prev,last;
  for(let r=0;r<p.nr;r++){const u=r/(p.nr-1),[c,F,S,rad]=ring(u);
    for(let s=0;s<p.ns;s++){const th=s/p.ns*TAU,R=rad(th),a=Math.cos(th)*R,b=Math.sin(th)*R,i=(p.base+r*p.ns+s)*3;
      P[i]=c[0]+F[0]*a+S[0]*b;P[i+1]=c[1]+F[1]*a+S[1]*b;P[i+2]=c[2]+F[2]*a+S[2]*b;}
    if(r===0)first=c;if(r===1)second=c;if(r===p.nr-2)prev=c;if(r===p.nr-1)last=c;}
  const cs=(p.base+p.nr*p.ns)*3;P.set(first,cs);P.set(last,cs+3);p.nS=norm(sub(first,second));p.nE=norm(sub(last,prev));
}
function bodyNormals(){
  const P=BODY.pos,N=BODY.nor,I=BODY.idxT,O=BODY.pn;N.fill(0);
  for(let k=0;k<I.length;k+=3){const a=I[k]*3,b=I[k+1]*3,c=I[k+2]*3;
    const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    N[a]+=nx;N[a+1]+=ny;N[a+2]+=nz;N[b]+=nx;N[b+1]+=ny;N[b+2]+=nz;N[c]+=nx;N[c+1]+=ny;N[c+2]+=nz;}
  for(const p of BODY.parts){const cs=(p.base+p.nr*p.ns)*3;N.set(p.nS,cs);N.set(p.nE,cs+3);}
  for(let i=0,n=BODY.nv;i<n;i++){const x=N[i*3],y=N[i*3+1],z=N[i*3+2],l=Math.hypot(x,y,z)||1;O[i*6]=P[i*3];O[i*6+1]=P[i*3+1];O[i*6+2]=P[i*3+2];O[i*6+3]=x/l;O[i*6+4]=y/l;O[i*6+5]=z/l;}
}
// anatomical profiles (semi-axes in meters along each segment)
const TOR_S=[[0,.125],[.08,.166],[.2,.16],[.36,.132],[.55,.143],[.7,.158],[.79,.162],[.85,.14],[.89,.085],[.93,.064],[1,.06]];
const TOR_F=[[0,.08],[.08,.108],[.2,.103],[.35,.096],[.55,.103],[.7,.11],[.79,.103],[.84,.084],[.88,.062],[1,.056]];
const TH_F=[[0,.078],[.15,.089],[.5,.08],[.85,.062],[1,.052]],TH_S=[[0,.075],[.18,.086],[.5,.075],[.85,.057],[1,.05]];
const SH_F=[[0,.049],[.2,.046],[.6,.035],[1,.03]],SH_S=[[0,.048],[.25,.049],[.6,.037],[1,.03]];
const UA_F=[[0,.046],[.18,.05],[.5,.045],[.85,.038],[1,.035]],UA_S=[[0,.05],[.2,.055],[.5,.044],[.85,.038],[1,.036]];
const FA_F=[[0,.035],[.22,.041],[.6,.032],[1,.022]],FA_S=[[0,.037],[.22,.046],[.6,.035],[1,.028]];
const HA_F=[[0,.02],[.3,.018],[.5,.014],[1,.009]],HA_S=[[0,.03],[.3,.043],[.55,.041],[1,.035]];
const SHOE_H=[[0,.06],[.08,.088],[.3,.096],[.5,.072],[.75,.05],[.92,.034],[1,.02]],SHOE_W=[[0,.025],[.08,.034],[.3,.04],[.62,.047],[.85,.04],[1,.016]];
function bodyPose(){
  const sp=st.sprint,cr=st.crank,breath=Math.sin(T*2.4)*0.004*(1+sp);
  const bob=(1-sp)*0.004*Math.sin(2*cr)+sp*0.011*Math.sin(2*st.rockPh-0.4);
  const se=standEnv();
  const hipBase=lerp3([-0.205+sp*0.15,1.02+sp*0.035+bob,0],[-0.07,0.955,0.015],se);
  const th=lerp(40-15*sp,54,se)*DEG,D=[Math.cos(th),Math.sin(th),0],Bk=[-Math.sin(th),Math.cos(th),0],Fb=[Math.sin(th),-Math.cos(th),0];
  const sway=-sp*0.055*Math.sin(st.rockPh-0.3)+se*Math.sin(STAND_LEAN)*0.75;
  const tp=u=>{const k=Math.min(u,0.84)/0.84;return add(add(hipBase,mul(D,0.6*k)),add(mul(Bk,(0.032+breath)*Math.sin(Math.PI*k)),[0,0,sway*k]));};
  const C7=tp(0.84),dn=th+(22-12*sp)*DEG,Dn=[Math.cos(dn),Math.sin(dn),0],neckTop=add(C7,mul(Dn,0.088));
  const ph=-0.1-sp*(0.24+0.07*Math.sin(2*st.rockPh-0.6))+0.02*Math.sin(T*0.7)*(1-sp),hf=[Math.cos(ph),Math.sin(ph),0],hu=[-Math.sin(ph),Math.cos(ph),0],hs=[0,0,1];
  const headC=add(neckTop,add(mul(hu,0.064),mul(hf,0.04)));
  return{sp,cr,hipBase,D,Bk,Fb,tp,C7,neckTop,hf,hu,hs,headC,sway,se};
}
function fillLeg(P,p,s){
  const hip=add(P.hipBase,add(mul(P.D,0.075),add(mul(P.Bk,-0.015),[0,0,0.082*s+P.sway*0.3])));
  const a=-P.cr+(s<0?Math.PI:0),al=-0.25+0.2*Math.cos(a+0.6);let spd=[Math.cos(a)*0.17,0.29+Math.sin(a)*0.17,0.128*s];
  let ff=[Math.cos(al),Math.sin(al),0],fu=[-Math.sin(al),Math.cos(al),0];
  let ankle=add(spd,add(mul(ff,-0.125),mul(fu,0.09)));ankle[2]=0.116*s;
  let g=0;
  if(s<0&&P.se>0.001){// [Argus app] foot on the ground beside the bike, leg extended
    g=P.se;const b=bikeBasis,cb=camBasis,toL=v=>[dot(v,b.fwd),dot(v,b.up),dot(v,b.right)];
    const sole=add(cb.p,add(mul(cb.right,-0.36),mul(cb.fwd,-0.02))),gA=toL(sub(add(sole,mul(cb.up,0.085)),b.p));
    const gF=norm(toL(cb.fwd)),gU=norm(toL(cb.up)),lift=Math.sin(Math.PI*g)*0.09;
    ankle=add(lerp3(ankle,gA,g),mul(gU,lift));
    const nf=norm(lerp3(ff,gF,g)),nu=norm(lerp3(fu,gU,g));
    spd=add(ankle,add(mul(nf,0.125),mul(nu,-0.09)));ff=nf;fu=nu;
  }
  const knee=ik3(hip,ankle,0.44,0.425,norm([1,0.05,0.12*s]));
  const top=add(hip,mul(norm(sub(hip,knee)),0.07)),end=add(ankle,mul(norm(sub(ankle,knee)),0.03));
  const pts=[top,knee,end],kd=norm(add(norm(sub(knee,lerp3(top,end,0.5))),[0.3,0,0])),L1=len(sub(knee,top));
  const thm=-s*Math.PI/2,mb=Math.atan2(Math.sin(thm),-1);
  fillPart(p,u=>{const q=chainAt(pts,u,0.045),F=norm(sub(kd,mul(q.T,dot(kd,q.T)))),S=cross(q.T,F),sA=q.s;
    if(sA<L1){const t=sA/L1,af=curveP(TH_F,t),as=curveP(TH_S,t);return[q.c,F,S,th=>{const ct=Math.cos(th);let R=sell(af,as,th,2.2);
      R+=gss(t,0.5,0.25)*0.016*Math.pow(Math.max(0,ct),2);R+=gss(t,0.82,0.1)*0.017*Math.pow(Math.max(0,Math.cos(th-thm*0.55)),3);
      R+=gss(t,0.45,0.28)*0.011*Math.pow(Math.max(0,-ct),2)+gss(t,0.4,0.25)*0.006*Math.pow(Math.max(0,Math.cos(th+thm)),2);R+=gss(sA-L1,-0.012,0.028)*0.014*Math.pow(Math.max(0,ct),4);return R;}];}
    const t=(sA-L1)/(q.L-L1),af=curveP(SH_F,t),as=curveP(SH_S,t);return[q.c,F,S,th=>{const ct=Math.cos(th);let R=sell(af,as,th,2.2);
      R+=gss(t,0.22,0.17)*0.026*Math.pow(Math.max(0,-ct),1.5);R+=gss(t,0.26,0.14)*0.008*Math.pow(Math.max(0,Math.cos(th-mb)),2);
      R-=gss(t,0.5,0.35)*0.006*Math.pow(Math.max(0,ct),4);R+=gss(sA-L1,0,0.025)*0.01*Math.pow(Math.max(0,ct),4);return R;}];});
  return{spd,ff,fu,knee,ankle,g};
}
function fillShoe(p,f,s){fillPart(p,u=>{const x=lerp(-0.19,0.095,u),h=curveP(SHOE_H,u),w=curveP(SHOE_W,u),c=add(f.spd,add(mul(f.ff,x),mul(f.fu,-0.013+h/2)));c[2]=lerp(0.128*s,c[2],f.g||0);return[c,f.fu,f.g?norm(cross(f.ff,f.fu)):[0,0,1],th=>sell(h/2,w,th,3)];});}
function fillArm(P,p,s){
  const sh=add(P.tp(0.79),add(mul(P.Fb,0.02),[0,0,0.158*s])),wr=lerp3([0.63,0.985,0.2*s],[0.585,0.85,0.2*s],P.sp);
  const el=ik3(sh,wr,0.31,0.25,norm([lerp(-0.35,-0.25,P.sp),-1,lerp(0.6,0.72,P.sp)*s])),top=add(sh,[0,0.004,-0.04*s]),end=add(wr,mul(norm(sub(wr,el)),0.015));
  const pts=[top,el,end],L1=len(sub(el,top)),fr=norm(sub(lerp3(top,end,0.5),el));
  fillPart(p,u=>{const q=chainAt(pts,u,0.035),F=norm(sub(fr,mul(q.T,dot(fr,q.T)))),S=cross(q.T,F);
    if(q.s<L1){const t=q.s/L1,af=curveP(UA_F,t),as=curveP(UA_S,t);return[q.c,F,S,th=>{const ct=Math.cos(th);let R=sell(af,as,th,2.1);R+=gss(t,0.55,0.2)*0.007*Math.pow(Math.max(0,ct),2);R+=gss(t,0.45,0.25)*0.006*Math.pow(Math.max(0,-ct),2);return R;}];}
    const t=(q.s-L1)/(q.L-L1),af=curveP(FA_F,t),as=curveP(FA_S,t);return[q.c,F,S,th=>{let R=sell(af,as,th,2.1);R+=gss(q.s-L1,0,0.025)*0.01*Math.pow(Math.max(0,-Math.cos(th)),3);return R;}];});
  return{sh,el,wr};
}
function fillHand(p,pt,s,wr){
  const z=0.2*s,k=st.sprint,LP=(a,b)=>lerp3(a,b,k);
  const pts=[wr,LP([0.705,0.975,z],[0.64,0.845,z]),LP([0.732,0.955,z],[0.665,0.83,z]),LP([0.735,0.92,z],[0.663,0.8,z]),LP([0.715,0.9,z],[0.64,0.795,z])];
  fillPart(p,u=>{const q=chainAt(pts,u,0.012),F=norm(cross([0,0,1],q.T)),S=cross(q.T,F),af=curveP(HA_F,u),as=curveP(HA_S,u);return[q.c,F,S,th=>sell(af,as,th,2.4)+gss(u,0.32,0.06)*0.004*Math.max(0,Math.cos(th))];});
  const tp=[add(wr,[0.005,-0.006,-0.026*s]),LP([0.668,0.962,z-0.04*s],[0.615,0.825,z-0.035*s]),LP([0.695,0.952,z-0.03*s],[0.64,0.81,z-0.028*s])];
  fillPart(pt,u=>{const q=chainAt(tp,u,0.01),F=perp(q.T)[0],r=lerp(0.012,0.008,u);return[q.c,F,cross(q.T,F),()=>r];});
}
function fillHeadGear(P){
  const hc=P.headC,hf=P.hf,hu=P.hu,hs=P.hs;
  fillPart(PT.head,u=>{const ph=u*Math.PI,y=Math.cos(ph),sp=Math.max(Math.sin(ph),0.002),c=add(hc,add(mul(hu,y*0.112),mul(hf,-0.006*y)));
    let ef=0.098,es=0.077;if(y<-0.2){es*=lerp(1,0.7,smooth(-0.2,-1,y));ef*=lerp(1,0.86,smooth(-0.3,-1,y));}
    return[c,hf,hs,th=>{const ct=Math.cos(th),sa=Math.abs(Math.sin(th));let R=sell(ef,es,th,2);
      R+=0.006*Math.max(0,-ct)*gss(y,0.3,0.4)+gss(y,-0.12,0.13)*0.026*Math.pow(Math.max(0,ct),14)+gss(y,-0.3,0.12)*0.008*gss(sa,0.55,0.2)*Math.max(0,ct)+gss(y,0.18,0.08)*0.006*Math.pow(Math.max(0,ct),6)+gss(y,0,0.15)*0.012*Math.pow(sa,20)+gss(y,-0.85,0.12)*0.01*Math.pow(Math.max(0,ct),4);
      return R*sp;}];});
  // helmet: cut higher at the forehead and lower at the nape
  const Hh=add(hc,add(mul(hu,0.024),mul(hf,-0.012))),p=PT.helmet,B=BODY.pos;
  for(let r=0;r<p.nr;r++){const u=r/(p.nr-1);for(let s=0;s<p.ns;s++){const th=s/p.ns*TAU,ct=Math.cos(th),st2=Math.sin(th),ph=helmetPhi(u,th),y=Math.cos(ph),sp=Math.sin(ph);
    let R=sell(lerp(0.146,0.135,smooth(-0.3,0.3,ct)),0.103,th,2.15);R+=helmetFeat(u,th)[0];R*=sp;
    const q=add(Hh,add(mul(hu,y*0.116),add(mul(hf,-0.008*(1-y)+ct*R),mul(hs,st2*R)))),i=(p.base+r*p.ns+s)*3;B[i]=q[0];B[i+1]=q[1];B[i+2]=q[2];}}
  {const cs=(p.base+p.nr*p.ns)*3;B.set(add(Hh,mul(hu,0.116)),cs);B.set(Hh,cs+3);p.nS=hu;p.nE=mul(hu,-1);}
  // wraparound glasses
  const lensAt=ps=>add(hc,add(mul(hu,0.012),add(mul(hf,Math.cos(ps)*0.104),mul(hs,Math.sin(ps)*0.087))));
  fillPart(PT.lens,u=>{const ps=lerp(-1.2,1.2,u),c=lensAt(ps),T=norm(add(mul(hf,-Math.sin(ps)*0.104),mul(hs,Math.cos(ps)*0.087))),S=cross(T,hu),af=0.021*(1-0.35*smooth(0.75,1,Math.abs(2*u-1)));return[c,hu,S,th=>sell(af,0.0035,th,4)];});
  for(const[pp,s]of[[PT.tempR,1],[PT.tempL,-1]]){const pts=[lensAt(1.2*s),add(hc,add(mul(hs,0.084*s),mul(hf,-0.02))),add(hc,add(mul(hs,0.079*s),add(mul(hf,-0.07),mul(hu,-0.02))))];
    fillPart(pp,u=>{const q=chainAt(pts,u,0.01),F=perp(q.T)[0];return[q.c,F,cross(q.T,F),()=>0.003];});}
  for(const[pp,p2,s]of[[PT.strapR,PT.strapR2,1],[PT.strapL,PT.strapL2,-1]]){const W=(a,f,v)=>add(hc,add(mul(hs,a*s),add(mul(hf,f),mul(hu,v))));
    const spl=W(0.072,0.0,-0.056),pts=[W(0.088,0.045,0.012),spl,W(0.05,0.045,-0.095),W(0,0.06,-0.115)],pr=[W(0.087,-0.058,0.004),spl];
    fillPart(pp,u=>{const q=chainAt(pts,u,0.015),F=perp(q.T)[0];return[q.c,F,cross(q.T,F),()=>0.0038];});
    fillPart(p2,u=>{const q=chainAt(pr,u,0.01),F=perp(q.T)[0];return[q.c,F,cross(q.T,F),()=>0.0038];});}
}
let BP=null;
function buildBody(target){
  const P=bodyPose();BP=P;
  const P0=P.tp(0.8),P1=P.C7,P2=P.neckTop;
  fillPart(PT.torso,u=>{let c,T;
    if(u<0.8){c=P.tp(u);T=norm(sub(P.tp(u+0.01),P.tp(Math.max(0,u-0.01))));}
    else{const t=(u-0.8)/0.2;c=add(add(mul(P0,(1-t)*(1-t)),mul(P1,2*(1-t)*t)),mul(P2,t*t));T=norm(add(mul(sub(P1,P0),2*(1-t)),mul(sub(P2,P1),2*t)));}
    const F=norm(cross(T,[0,0,1])),S=cross(T,F),af=curveP(TOR_F,u),as=curveP(TOR_S,u),n=lerp(2.6,2,smooth(0.78,0.9,u));
    return[c,F,S,th=>{const ct=Math.cos(th),sa=Math.abs(Math.sin(th));let R=sell(af,as,th,n);
      R+=gss(u,0.73,0.07)*0.012*Math.pow(Math.max(0,ct),2)*gss(sa,0.5,0.3);
      R+=gss(u,0.76,0.07)*0.01*Math.pow(Math.max(0,-ct),2)*gss(sa,0.5,0.25);
      const dp=Math.atan2(Math.sin(th-Math.PI),Math.cos(th-Math.PI));R-=0.006*gss(u,0.5,0.28)*Math.exp(-(dp/0.22)*(dp/0.22));
      R+=gss(u,0.07,0.07)*0.02*Math.max(0,-ct)*gss(sa,0.5,0.3);R+=gss(u,0.64,0.12)*0.008*sa*sa;return R;}];});
  const lr=fillLeg(P,PT.legR,1),ll=fillLeg(P,PT.legL,-1);fillShoe(PT.shoeR,lr,1);fillShoe(PT.shoeL,ll,-1);
  const ar=fillArm(P,PT.armR,1),al=fillArm(P,PT.armL,-1);fillHand(PT.handR,PT.thumbR,1,ar.wr);fillHand(PT.handL,PT.thumbL,-1,al.wr);
  fillHeadGear(P);
  bodyNormals();
  gl.bindBuffer(gl.ARRAY_BUFFER,target.pb);gl.bufferSubData(gl.ARRAY_BUFFER,0,BODY.pn);
  st.scr3={crank:BL(0,0.29,0.1),pedal:BL(...lr.spd),chest:BL(...P.tp(0.6))};
}

// ================= camera
let camPos=null,camTgt=null,VP=ID,camNow=[0,0,0];
function cameraTarget(){
  const b=camBasis,P=b.p;
  if(st.cam===0)return{pos:add(P,add(mul(b.fwd,-7.6),add(mul(b.up,3.2),mul(b.right,-0.7)))),tgt:add(P,add(mul(b.fwd,7),mul(b.up,0.8)))};
  if(st.cam===1)return{pos:add(P,add(mul(b.fwd,-15),add(mul(b.up,9),mul(b.right,-3)))),tgt:add(P,add(mul(b.fwd,10),mul(b.up,0.5)))};
  const a=T*0.18;return{pos:add(P,add(mul(b.fwd,Math.cos(a)*7.5),add(mul(b.right,Math.sin(a)*3.5),mul(b.up,1.4+0.6*Math.sin(T*0.11))))),tgt:add(P,mul(b.up,0.95))};
}
function updateCamera(dt){
  const c=cameraTarget();
  const P0=camBasis.p,oP=sub(c.pos,P0),oT=sub(c.tgt,P0);
  if(!camPos){camPos=oP;camTgt=oT;}
  const k=1-Math.exp(-dt*(st.cam===2?2.5:4));camPos=mix3(camPos,oP,k);camTgt=mix3(camTgt,oT,k);
  camPos=add(P0,camPos);camTgt=add(P0,camTgt);
  const gy=groundY(-camPos[2],camPos[0]-roadX(-camPos[2]))+0.6;if(camPos[1]<gy)camPos[1]=gy;
  const shake=0;const pos=add(camPos,[Math.sin(T*23)*shake,Math.sin(T*31)*shake,0]);
  camNow=pos;const tg=camTgt;camPos=sub(camPos,P0);camTgt=sub(camTgt,P0);
  const proj=M4.persp(52*Math.PI/180,cw/ch,0.1,2500);VP=M4.mul(proj,M4.look(pos,tg,[0,1,0]));
}
function project(p){const r=M4.ap(VP,p);if(r[3]<=0)return null;return[(r[0]*0.5+0.5)*cw,(1-(r[1]*0.5+0.5))*ch];}

// ================= drawing
let cw=0,ch=0,DPR=1;
function resize(){DPR=Math.min(OPT.maxPixelRatio,(window.devicePixelRatio||1)*OPT.renderScale);cw=Math.max(1,container.clientWidth);ch=Math.max(1,container.clientHeight);cv.width=Math.round(cw*DPR);cv.height=Math.round(ch*DPR);ov.width=Math.round(cw*DPR);ov.height=Math.round(ch*DPR);}
const ro=new ResizeObserver(resize);ro.observe(container);
function setCommon(){
  gl.useProgram(P);
  gl.uniformMatrix4fv(U.uVP,false,VP);gl.uniform1f(U.uTime,T);gl.uniform1i(U.uBloom,0);
  gl.uniform3fv(U.uSunDir,L.sunDir);gl.uniform3fv(U.uSunCol,L.lightC);gl.uniform3fv(U.uSkyAmb,L.skyAmb);gl.uniform3fv(U.uGndAmb,L.gndAmb);
  gl.uniform3fv(U.uFog,L.fog);gl.uniform3fv(U.uCam,camNow);gl.uniform1f(U.uFogDen,1/430);gl.uniform1f(U.uNight,L.night);
  const b=bikeBasis;gl.uniform3fv(U.uLampPos,BL(0.66,0.9,0));gl.uniform3fv(U.uLampDir,norm(add(b.fwd,mul(b.up,-0.12))));gl.uniform1f(U.uLamp,smooth(0.15,0.6,L.night));
  gl.uniform1f(U.uEmis,0);gl.uniform1f(U.uAlpha,1);gl.uniform1f(U.uTintOn,0);gl.uniform1f(U.uSpec,0);
  gl.uniform1i(U.uShadow,1);gl.uniformMatrix4fv(U.uShadowVP,false,SVP||ID);gl.uniform1f(U.uShadowOn,shadowOn);
}
function drawMesh(g,m,tint,emis=0,alpha=1,spec=0){gl.uniform1f(U.uSpec,spec);
  gl.uniformMatrix4fv(U.uModel,false,m);
  if(tint){gl.uniform1f(U.uTintOn,1);gl.uniform3fv(U.uTint,tint);}else gl.uniform1f(U.uTintOn,0);
  gl.uniform1f(U.uEmis,emis);gl.uniform1f(U.uAlpha,alpha);
  gl.bindVertexArray(g.vao);gl.drawArrays(gl.TRIANGLES,0,g.n);
}
function shadowPass(){
  const Ld=L.sunDir;shadowOn=Ld[1]>0.06?1:0;if(!shadowOn)return;
  const hz=norm([Ld[0],0,Ld[2]]),c=sub(add(bikeBasis.p,[0,0.75,0]),mul(hz,Math.min(1.4,0.5/Math.max(Ld[1],0.2)))),eye=add(c,mul(Ld,14)),up=Math.abs(Ld[1])>0.97?[0,0,-1]:[0,1,0];
  SVP=M4.mul(M4.ortho(-2.6,2.6,-2.6,2.6,1,32),M4.look(eye,c,up));
  gl.bindFramebuffer(gl.FRAMEBUFFER,shFB);gl.viewport(0,0,SHN,SHN);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(DP);gl.uniformMatrix4fv(DU.uLVP,false,SVP);
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.5,3);
  for(const pt of parts){if(pt.alpha<1||pt.emis)continue;gl.uniformMatrix4fv(DU.uModel,false,pt.m);gl.bindVertexArray(pt.mesh.vao);gl.drawArrays(gl.TRIANGLES,0,pt.mesh.n);}
  gl.uniformMatrix4fv(DU.uModel,false,bikeM);gl.bindVertexArray(bodyGL.vao);gl.drawElements(gl.TRIANGLES,bodyGL.n,gl.UNSIGNED_SHORT,0);
  gl.disable(gl.POLYGON_OFFSET_FILL);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}
function setPB(){
  gl.useProgram(PB);gl.uniformMatrix4fv(PU.uVP,false,VP);
  gl.uniform3fv(PU.uSunDir,L.sunDir);gl.uniform3fv(PU.uSunCol,L.lightC);gl.uniform3fv(PU.uSkyAmb,L.skyAmb);gl.uniform3fv(PU.uGndAmb,L.gndAmb);gl.uniform3fv(PU.uFog,L.fog);gl.uniform3fv(PU.uCam,camNow);gl.uniform1f(PU.uFogDen,1/430);
  const b=bikeBasis;gl.uniform3fv(PU.uLampPos,BL(0.72,0.91,0));gl.uniform3fv(PU.uLampDir,norm(add(b.fwd,mul(b.up,-0.12))));gl.uniform1f(PU.uLamp,smooth(0.15,0.6,L.night));
  gl.uniform1i(PU.uShadow,1);gl.uniformMatrix4fv(PU.uShadowVP,false,SVP||ID);gl.uniform1f(PU.uShadowOn,shadowOn);gl.uniform1f(PU.uAlpha,1);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,logoTex);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(PU.uLogo,2);gl.uniform1f(PU.uLogoOn,logoOn);gl.uniform1f(PU.uGhost,0);
}
function drawPB(mesh,m,tint,mat,emis=0,alpha=1){gl.uniformMatrix4fv(PU.uModel,false,m);gl.uniform1f(PU.uUseV,0);gl.uniform3fv(PU.uTint,tint);gl.uniform3fv(PU.uMatU,mat);gl.uniform1f(PU.uEmis,emis);gl.uniform1f(PU.uAlpha,alpha);gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.n);}
function render(){
  shadowPass();
  gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  // sky
  gl.disable(gl.DEPTH_TEST);gl.useProgram(SP);
  gl.uniformMatrix4fv(SU.uInv,false,M4.inv(VP));gl.uniform3fv(SU.uCam,camNow);gl.uniform3fv(SU.uTop,L.top);gl.uniform3fv(SU.uMid,L.mid);gl.uniform3fv(SU.uHor,L.hor);
  gl.uniform3fv(SU.uSunDir,L.sunRaw);gl.uniform3fv(SU.uSunC,L.sunC);gl.uniform3fv(SU.uMoonDir,L.moonDir);gl.uniform1f(SU.uNight,L.night);gl.uniform1f(SU.uTime,T);gl.uniform1f(SU.uSunVis,L.sunVis>0?smooth(-0.06,0.02,L.sunRaw[1]):0);gl.uniform1f(SU.uMoonVis,L.moonVis);
  gl.bindVertexArray(skyVAO);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  setCommon();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shTex);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,bloomTex);
  for(const[,c]of chunks)drawMesh(c.g,ID,null);
  drawMesh(uSea,M4.T(0,0,-st.dist),null);
  if(gates)drawMesh(gates.g,ID,null);
  // wind turbine rotors
  const wind=1.0+0.35*Math.sin(T*0.13);
  for(const[,c]of chunks)for(const t of c.tur){const m=M4.mul(M4.T(t.p[0],t.p[1],t.p[2]),M4.RZ(T*wind+t.r));drawMesh(uRotor,m,lit(COL.tower));
    if(L.night>0.3&&Math.sin(T*3+t.r*5)>0.3)drawMesh(uSph,M4.mul(M4.T(t.p[0],t.p[1]+1.3,t.p[2]+2),M4.S(0.35,0.35,0.35)),[1,0.2,0.2],1);}
  // rider
  setPB();
  for(const pt of parts){if(pt.alpha<1)continue;drawPB(pt.mesh,pt.m,pt.col,partMat(pt),pt.emis);}
  gl.uniformMatrix4fv(PU.uModel,false,bikeM);gl.uniform1f(PU.uUseV,1);gl.uniform1f(PU.uEmis,0);gl.uniform1f(PU.uAlpha,1);gl.bindVertexArray(bodyGL.vao);gl.drawElements(gl.TRIANGLES,bodyGL.n,gl.UNSIGNED_SHORT,0);
  drawGhost();
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  for(const pt of parts){if(pt.alpha>=1)continue;drawPB(pt.mesh,pt.m,pt.col,[1,0,3],1,pt.alpha);}
  gl.depthMask(true);gl.disable(gl.BLEND);
}
const lit=c=>c;

// ================= 2D overlay
const petals=[],streaks=[],flies=[];
function burst(m,n){for(let k=0;k<n;k++){const s=m-1-Math.random()*3,side=Math.random()<0.5?-1:1,d=side*(5.8+Math.random()*7),p=WP(s,d,0.4);petals.push({p,v:[(Math.random()-0.5)*1.5,1.8+Math.random()*2.2,(Math.random()-0.5)*1.5],life:2+Math.random(),c:['#ffcc2e','#ff7eb3','#fff6e8'][k%3],rot:Math.random()*TAU});}}
function overlay(dt){
  oc.setTransform(DPR,0,0,DPR,0,0);oc.clearRect(0,0,cw,ch);
  // wind
  if(Math.random()<st.v*1.1*dt){const a=Math.random()*TAU,r=0.15+Math.random()*0.35;streaks.push({a,r,l:0.02+Math.random()*0.05,t:0,al:0.1+Math.random()*0.15});}
  oc.lineCap='round';oc.lineWidth=1.2;
  for(let k=streaks.length-1;k>=0;k--){const s=streaks[k];s.t+=dt*st.v*0.09;if(s.t>1){streaks.splice(k,1);continue;}
    const r0=s.r+s.t*0.6,r1=r0+s.l*(1+st.v*0.08),cx=cw/2,cy=ch*0.48,R=Math.max(cw,ch)*0.7;
    oc.strokeStyle=L.night>0.5?`rgba(170,195,255,${s.al*0.6})`:`rgba(255,255,255,${s.al})`;oc.beginPath();oc.moveTo(cx+Math.cos(s.a)*r0*R,cy+Math.sin(s.a)*r0*R*0.6);oc.lineTo(cx+Math.cos(s.a)*r1*R,cy+Math.sin(s.a)*r1*R*0.6);oc.stroke();}
  // petals
  for(let k=petals.length-1;k>=0;k--){const q=petals[k];q.life-=dt;if(q.life<=0){petals.splice(k,1);continue;}
    q.v[1]-=3.2*dt;q.p=add(q.p,mul(q.v,dt));q.rot+=dt*5;const sp=project(q.p);if(!sp)continue;
    const dd=len(sub(q.p,camNow)),r=clamp(60/dd,1.2,7);oc.globalAlpha=clamp(q.life,0,1);oc.fillStyle=q.c;oc.beginPath();oc.ellipse(sp[0],sp[1],r,r*0.55,q.rot,0,TAU);oc.fill();}
  oc.globalAlpha=1;
  // fireflies
  const want=L.night>0.4?42:0;
  while(flies.length<want){const s=st.dist+5+Math.random()*60,d=(Math.random()<0.5?-1:1)*(6+Math.random()*16);flies.push({p:WP(s,d,0.5+Math.random()*1.8),ph:Math.random()*TAU});}
  if(flies.length>want)flies.length=want;
  oc.globalCompositeOperation='lighter';
  for(const f of flies){if(-f.p[2]<st.dist-8){const s=st.dist+20+Math.random()*50,d=(Math.random()<0.5?-1:1)*(6+Math.random()*16);f.p=WP(s,d,0.5+Math.random()*1.8);}
    f.p=add(f.p,[Math.sin(T+f.ph)*0.4*dt,Math.cos(T*1.3+f.ph)*0.3*dt,0]);const sp=project(f.p);if(!sp)continue;
    const a=L.night*(0.4+0.6*Math.max(0,Math.sin(T*3+f.ph))),r=clamp(140/len(sub(f.p,camNow)),3,14);
    const g=oc.createRadialGradient(sp[0],sp[1],0,sp[0],sp[1],r);g.addColorStop(0,`rgba(210,255,120,${a})`);g.addColorStop(1,'rgba(210,255,120,0)');oc.fillStyle=g;oc.fillRect(sp[0]-r,sp[1]-r,r*2,r*2);}
  oc.globalCompositeOperation='source-over';
  const vg=oc.createRadialGradient(cw/2,ch*0.55,Math.min(cw,ch)*0.38,cw/2,ch*0.55,Math.max(cw,ch)*0.8);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,`rgba(5,8,20,${0.25+L.night*0.25})`);oc.fillStyle=vg;oc.fillRect(0,0,cw,ch);
}

// ================= [Argus app] record ghost and start/finish gates
// The ghost reuses the same rider: body and bike are built a second time with the ghost's
// state (distance, pedaling) and drawn as a translucent hologram in the left lane. The gates
// are static meshes in the coastal style: carnauba palm posts, a canvas banner and São João
// bunting flags.
const GHOST_COL=cc('#4fe3ff'),GHOST_A=0.5,GHOST_RANGE=260;
const GH={provider:null,label:null,dist:0,v:0,cad:0,crank:0,wheel:0,stand:1,visible:false,parts:[],m:ID,head:null};
let ghostGL=null,jumped=false;
function updateGhost(dt){
  GH.visible=false;if(!GH.provider)return;
  let g=null;try{g=GH.provider();}catch(e){g=null;}
  if(!g||!Number.isFinite(+g.distanceM))return;
  const v=Math.max(0,(+g.speedKmh||0)/3.6),cad=g.cadence!=null?Math.max(0,+g.cadence||0):(v>0.3?88:0);
  GH.v+=(v-GH.v)*(1-Math.exp(-dt*4));GH.cad+=(cad-GH.cad)*(1-Math.exp(-dt*3));
  GH.dist=origin+(+g.distanceM);{const e=GH.stand*GH.stand*(3-2*GH.stand);GH.crank+=GH.cad/60*TAU*dt*(1-e);}GH.wheel+=GH.v*dt/0.335;
  {const down=v<STAND_ON&&cad<5;GH.stand+=((down?1:0)-GH.stand)*(1-Math.exp(-dt*(down?4:7.5)));}if(GH.stand>0.5&&GH.cad<5)GH.crank+=wrapA(CRANK_READY-GH.crank)*(1-Math.exp(-dt*3));
  GH.visible=Math.abs(GH.dist-st.dist)<GHOST_RANGE;
}
function buildGhost(){
  if(!GH.visible)return;
  if(!ghostGL)ghostGL=makeGhostGL();
  const sv=[st.dist,st.crank,st.wheel,st.sprint,st.rockPh,st.scr3,st.stand];
  st.dist=GH.dist;st.crank=GH.crank;st.wheel=GH.wheel;st.sprint=0;st.rockPh=0;st.stand=GH.stand;
  buildRider(GHOST_D,ghostGL);
  GH.parts=parts.slice();GH.m=bikeM;const h=BP.headC;GH.head=BL(h[0],h[1]+0.32,h[2]);
  [st.dist,st.crank,st.wheel,st.sprint,st.rockPh,st.scr3,st.stand]=sv;
}
function drawGhostPass(alpha){
  for(const pt of GH.parts){if(pt.alpha<1)continue;drawPB(pt.mesh,pt.m,pt.col,partMat(pt),pt.emis,alpha);}
  gl.uniformMatrix4fv(PU.uModel,false,GH.m);gl.uniform1f(PU.uUseV,1);gl.uniform1f(PU.uEmis,0);gl.uniform1f(PU.uAlpha,alpha);
  gl.bindVertexArray(ghostGL.vao);gl.drawElements(gl.TRIANGLES,ghostGL.n,gl.UNSIGNED_SHORT,0);
}
function drawGhost(){
  if(!GH.visible||!ghostGL)return;
  // depth pre-pass: the hologram shows only its front shell, not the inside
  gl.colorMask(false,false,false,false);drawGhostPass(1);gl.colorMask(true,true,true,true);
  gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  gl.uniform1f(PU.uGhost,1);gl.uniform3fv(PU.uGhostCol,GHOST_COL);drawGhostPass(GHOST_A);gl.uniform1f(PU.uGhost,0);
  gl.depthMask(true);gl.disable(gl.BLEND);gl.depthFunc(gl.LESS);
}
function drawGhostLabel(){
  if(!GH.visible||!GH.label||!GH.head)return;
  const sp=project(GH.head);if(!sp)return;
  const dd=len(sub(GH.head,camNow)),a=clamp(1.15-dd/GHOST_RANGE,0,1);if(a<=0.02)return;
  oc.setTransform(DPR,0,0,DPR,0,0);oc.globalAlpha=a;
  oc.font='700 12px system-ui,-apple-system,"Segoe UI",sans-serif';
  const tw=oc.measureText(GH.label).width,w=tw+30,h=24,x=sp[0]-w/2,y=sp[1]-h-6;
  oc.fillStyle='rgba(8,20,44,0.72)';oc.beginPath();
  if(oc.roundRect)oc.roundRect(x,y,w,h,12);else oc.rect(x,y,w,h);oc.fill();
  oc.strokeStyle='rgba(79,227,255,0.85)';oc.lineWidth=1.2;oc.stroke();
  oc.fillStyle='#4fe3ff';oc.beginPath();oc.arc(x+12,y+h/2,3.5,0,TAU);oc.fill();
  oc.fillStyle='#f4f8ff';oc.textBaseline='middle';oc.fillText(GH.label,x+21,y+h/2+0.5);
  oc.beginPath();oc.moveTo(sp[0]-5,y+h);oc.lineTo(sp[0]+5,y+h);oc.lineTo(sp[0],y+h+5);oc.closePath();oc.fillStyle='rgba(8,20,44,0.72)';oc.fill();
  oc.globalAlpha=1;
}

// ---- gates
let gates=null;
const GATE={post:cc('#7a6450'),ring:cc('#5a4838'),navy:cc('#14264f'),black:cc('#16171b'),stake:cc('#6e6052')};
const FLAGS=[cc('#ffcc2e'),cc('#d8362f'),cc('#2f86ff'),cc('#3fb86a'),cc('#ff7eb3'),cc('#f28c28'),cc('#f4efe4')];
function gateFrame(s){
  const c=[roadX(s),terr(s)+0.02,-s],f=norm([roadXD(s),0,-1]),r=norm(cross(f,[0,1,0]));
  return(d,h,fw=0)=>add(c,add(mul(r,d),add([0,h,0],mul(f,fw))));
}
function bunting(mb,a,b,sag,s,seed){
  const n=Math.max(4,Math.round(len(sub(b,a))/0.55)),pt=t=>add(lerp3(a,b,t),[0,-sag*4*t*(1-t),0]);
  for(let k=0;k<n;k++){const t0=k/n,t1=(k+1)/n,p0=pt(t0),p1=pt(t1);
    tube(mb,p0,p1,0.012,0.012,3,M(cc('#e9e2d0'),null,s,{w:0}),false);
    const q0=lerp3(p0,p1,0.12),q1=lerp3(p0,p1,0.88),tip=add(lerp3(p0,p1,0.5),[0,-0.36,0]);
    mb.tri(q0,q1,tip,M(FLAGS[(k+seed)%FLAGS.length],null,s,{w:0}));}
}
function buildGate(mb,s,finish){
  const Q=gateFrame(s),W=5.6,PH=6.7,BH=5.75;
  for(const sd of[-1,1]){
    const d=sd*6.3,g=groundY(s,d)-terr(s)-0.4;
    // carnauba palm post with rings and a stone base
    tube(mb,Q(d,g),Q(d,PH),0.24,0.2,8,M(GATE.post,null,s,{w:0}));
    for(let y=g+0.9;y<PH-0.3;y+=0.55)tube(mb,Q(d,y),Q(d,y+0.06),0.245,0.245,8,M(GATE.ring,null,s,{w:0}),false);
    for(let k=0;k<4;k++){const a=k/4*TAU+0.5;rock(mb,Q(d+Math.cos(a)*0.45,g+0.25,Math.sin(a)*0.45),0.32,s,s*7+k+(sd>0?11:0));}
    blob(mb,Q(d,PH+0.18),0.3,0.24,0.3,M(cc('#ffcc2e'),null,s,{w:0}),sd>0?3:5,0.25);
    // guy lines with bunting down to stakes at the roadside
    const stake=Q(sd*11.5,groundY(s,sd*11.5)-terr(s)+1.1);
    tube(mb,Q(sd*11.5,groundY(s,sd*11.5)-terr(s)-0.3),stake,0.05,0.04,5,M(GATE.stake,null,s,{w:0}));
    bunting(mb,Q(d,PH-0.15),stake,0.5,s,sd>0?2:0);
  }
  // log beam
  tube(mb,Q(-6.7,BH),Q(6.7,BH),0.17,0.17,8,M(GATE.post,null,s,{w:0}));
  // canvas banner: start in navy with yellow edges; finish checkered with red edges
  const top=BH-0.22,bot=BH-1.32,border=0.12,cols=finish?18:1,rows=finish?2:1;
  const panel=(d0,d1,h0,h1,col)=>{for(const fw of[-0.02,0.02])mb.quad(Q(d0,h0,fw),Q(d1,h0,fw),Q(d1,h1,fw),Q(d0,h1,fw),M(col,null,s,{w:0}));};
  const edge=finish?cc('#d8362f'):cc('#ffcc2e');
  panel(-W,W,top-border,top,edge);panel(-W,W,bot,bot+border,edge);
  for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const d0=-W+2*W*i/cols,d1=-W+2*W*(i+1)/cols,h1=top-border-(top-bot-2*border)*j/rows,h0=top-border-(top-bot-2*border)*(j+1)/rows;
    panel(d0,d1,h0,h1,finish?((i+j)%2?COL.white:GATE.black):GATE.navy);}
  if(!finish){// alternating yellow/white diamonds, like northeastern Brazilian lace
    const mid=(top+bot)/2,hh=0.3,hw=0.3;
    for(let k=-7;k<=7;k++){const x=k*0.75,m=M(k%2?COL.white:cc('#ffcc2e'),null,s,{w:0});
      for(const fw of[-0.03,0.03])mb.quad(Q(x-hw,mid,fw),Q(x,mid-hh,fw),Q(x+hw,mid,fw),Q(x,mid+hh,fw),m);}
  }
  for(const d of[-W*0.6,0,W*0.6])tube(mb,Q(d,top),Q(d,BH),0.015,0.015,3,M(cc('#e9e2d0'),null,s,{w:0}),false);
  bunting(mb,Q(-6.3,PH-0.1),Q(6.3,PH-0.1),0.35,s,4);
  // line painted on the asphalt: white at the start, checkered at the finish
  const R=(d,s2)=>[roadX(s2)+d,terr(s2)+0.05,-s2],ln=finish?17:1;
  for(let i=0;i<ln;i++)for(let j=0;j<(finish?2:1);j++){const d0=-4.2+8.4*i/ln,d1=-4.2+8.4*(i+1)/ln,s0=s+j*0.5,s1=s0+(finish?0.5:0.45);
    mb.quad(R(d0,s0),R(d1,s0),R(d1,s1),R(d0,s1),M(finish&&(i+j)%2?GATE.black:COL.white,null,s,{w:0}));}
}
// [Argus app] profile: [{d, h}] (m from the start line, elevation m), ascending in d
function setCourse(profile){
  const pts=Array.isArray(profile)?profile.filter(p=>Number.isFinite(+p.d)&&Number.isFinite(+p.h)):[];
  const had=!!course;
  if(pts.length<2)course=null;
  else{
    const d=pts.map(p=>+p.d),h=pts.map(p=>+p.h-(+pts[0].h)),n=d.length-1;
    course={origin,base:terrBase(origin),d,h,tail:d[n]>d[n-1]?(h[n]-h[n-1])/(d[n]-d[n-1]):0};
  }
  if(had||course){for(const[,c]of chunks){gl.deleteBuffer(c.g.buf);gl.deleteVertexArray(c.g.vao);}chunks.clear();ensureChunks(99);}
}
// [Argus app] distance-to-go boards every MARK_STEP m on the right shoulder, facing the rider:
// navy board, yellow seven-segment digits and a small "m", on a wooden post.
const MARK_STEP=100;
const SEG={0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgedc',7:'abc',8:'abcdefg',9:'abcfgd'};
function buildMarker(mb,s,meters){
  const Q=gateFrame(s),D=7.1,BW=0.95,B0=1.55,B1=2.45,y=COL_MARK.ink,front=-0.035;
  const g=groundY(s,D)-terr(s)-0.3;
  tube(mb,Q(D,g),Q(D,B0+0.1),0.07,0.06,6,M(GATE.post,null,s,{w:0}));
  const quad=(d0,d1,h0,h1,fw,col)=>mb.quad(Q(d0,h0,fw),Q(d1,h0,fw),Q(d1,h1,fw),Q(d0,h1,fw),M(col,null,s,{w:0}));
  for(const fw of[-0.02,0.02]){quad(D-BW,D+BW,B0,B1,fw,GATE.navy);}
  quad(D-BW,D+BW,B1-0.08,B1,front,y);quad(D-BW,D+BW,B0,B0+0.08,front,y); // yellow edges
  // digits, centered with the unit
  const txt=String(meters),dw=0.3,dh=0.52,t=0.065,gap=0.1,mw=0.26;
  const total=txt.length*dw+(txt.length-1)*gap+0.14+mw;
  let x=D-total/2;const h0=(B0+B1)/2-dh/2;
  const bar=(x0,x1,y0,y1)=>quad(x0,x1,y0,y1,front,y);
  for(const ch of txt){
    const on=SEG[ch]||'',X0=x,X1=x+dw,Y0=h0,Y1=h0+dh,Ym=h0+dh/2;
    if(on.includes('a'))bar(X0,X1,Y1-t,Y1);
    if(on.includes('g'))bar(X0,X1,Ym-t/2,Ym+t/2);
    if(on.includes('d'))bar(X0,X1,Y0,Y0+t);
    if(on.includes('f'))bar(X0,X0+t,Ym,Y1);
    if(on.includes('e'))bar(X0,X0+t,Y0,Ym);
    if(on.includes('b'))bar(X1-t,X1,Ym,Y1);
    if(on.includes('c'))bar(X1-t,X1,Y0,Ym);
    x+=dw+gap;
  }
  // lowercase "m": three stems and a top bar, half height
  x+=0.14-gap;const mh=dh*0.55,mt=0.05;
  bar(x,x+mw,h0+mh-mt,h0+mh);
  for(const k of[0,0.5,1]){const sx=x+k*(mw-mt);bar(sx,sx+mt,h0,h0+mh);}
}
const COL_MARK={ink:cc('#ffcc2e')};
function setGates(race){
  if(gates){gl.deleteBuffer(gates.g.buf);gl.deleteVertexArray(gates.g.vao);gates=null;}
  if(!race)return;
  const mb=new MB();
  if(Number.isFinite(race.start))buildGate(mb,origin+race.start,false);
  if(Number.isFinite(race.finish))buildGate(mb,origin+race.finish,true);
  if(Number.isFinite(race.finish)){
    const st0=Number.isFinite(race.start)?race.start:0;
    for(let togo=MARK_STEP;race.finish-togo>st0+10;togo+=MARK_STEP)buildMarker(mb,origin+race.finish-togo,togo);
  }
  if(mb.a.length)gates={g:mb.upload()};
}

// ================= optional input (manual sprint and camera switch)
const LS=[];const on=(t,e,f,o)=>{t.addEventListener(e,f,o);LS.push([t,e,f,o]);};
function setBoost(v){st.boost=v?1:0;if(v)st.lastInput=T;}
if(OPT.interactive){on(cv,'pointerdown',e=>{e.preventDefault();setBoost(true);});on(window,'pointerup',()=>setBoost(false));on(window,'pointercancel',()=>setBoost(false));on(window,'blur',()=>setBoost(false));on(cv,'contextmenu',e=>e.preventDefault());}
if(OPT.keyboard){on(window,'keydown',e=>{if(e.code==='Space'){e.preventDefault();setBoost(true);}else if(e.code==='KeyC')st.cam=(st.cam+1)%CAM_IDS.length;});on(window,'keyup',e=>{if(e.code==='Space')setBoost(false);});}

// ================= loop and public API
resize();ensureChunks(99);
let last=performance.now(),raf=0,disposed=false;
let fps=60;const capReq=[];
function frame(now){const raw=Math.max(1e-3,(now-last)/1000),dt=Math.min(0.05,raw);last=now;fps+=(1/raw-fps)*0.05;rawDt=Math.min(raw,0.5);
  update(dt);ensureChunks(jumped?99:1);jumped=false;lighting();updateGhost(dt);buildGhost();buildRider();updateCamera(dt);render();overlay(dt);drawGhostLabel();
  if(capReq.length){const c=document.createElement('canvas');c.width=cv.width;c.height=cv.height;const x=c.getContext('2d');x.drawImage(cv,0,0);x.drawImage(ov,0,0);for(const[r,q]of capReq.splice(0))r(c.toDataURL('image/jpeg',q));}
  raf=requestAnimationFrame(frame);}
const api={
  canvas:cv,
  start(){if(!raf&&!disposed){last=performance.now();raf=requestAnimationFrame(frame);}},
  stop(){if(raf){cancelAnimationFrame(raf);raf=0;}},
  setRideData(d={}){if('power'in d)EXT.power=d.power;if('cadence'in d)EXT.cadence=d.cadence;if('speedKmh'in d)EXT.speed=d.speedKmh;
    if('distanceM'in d){const v=d.distanceM;if(v==null||!Number.isFinite(+v))EXT.dist=null;else{if(EXT.dist==null&&!originLocked)origin=st.dist-(+v);EXT.dist=+v;EXT.distT=performance.now()/1000;}}},
  clearRideData(){EXT.power=EXT.cadence=EXT.speed=EXT.dist=null;originLocked=false;},
  // [Argus app] stops in place and fixes the course origin (race start = distance 0)
  resetRide(){origin=st.dist;originLocked=true;st.v=0;EXT.power=0;EXT.cadence=0;EXT.speed=0;EXT.dist=0;EXT.distT=performance.now()/1000;},
  // [Argus app] stopped immediately (no braking), e.g. when the app opens without a session
  halt(){st.v=0;st.P=0;st.cad=0;st.sprint=0;st.sprV=0;st.standOn=true;st.stand=1;st.stV=0;st.crank=CRANK_READY;EXT.power=0;EXT.cadence=0;EXT.speed=0;},
  setRace(race){setCourse(race?.profile);setGates(race||null);},
  setGhost(provider,label){GH.provider=typeof provider==='function'?provider:null;GH.label=label||null;if(!GH.provider)GH.visible=false;},
  clearRace(){setCourse(null);setGates(null);GH.provider=null;GH.label=null;GH.visible=false;},
  setFtp(w){if(Number.isFinite(+w)&&+w>0)FTP=+w;},
  setPixelRatio(r){if(Number.isFinite(+r)&&+r>0){OPT.maxPixelRatio=+r;resize();}},
  // [Argus app] supersampling: resolution = devicePixelRatio × scale (capped by maxPixelRatio)
  setRenderScale(k){if(Number.isFinite(+k)&&+k>0){OPT.renderScale=+k;resize();}},
  captureFrame(quality=0.8){return raf?new Promise(r=>capReq.push([r,quality])):Promise.resolve(null);},
  setSprint(v){EXT.sprint=(v===null||v===undefined)?null:!!v;},
  setCamera(name){const i=CAM_IDS.indexOf(name);if(i>=0)st.cam=i;},
  getCamera(){return CAM_IDS[st.cam];},
  setTimeOfDay(p,cycleSeconds){st.p=((p%1)+1)%1;if(cycleSeconds!==undefined)OPT.dayCycleSeconds=cycleSeconds;},
  getState(){return{distanceM:st.dist-startDist,speedKmh:st.v*3.6,power:st.P,cadence:st.cad,gradePct:terrD(st.dist)*100,altitudeM:38+terr(st.dist)*4,sprint:st.sprint,timeOfDay:st.p,camera:CAM_IDS[st.cam],fps,ghostDistanceM:GH.provider?GH.dist-origin:null,courseDistanceM:st.dist-origin};},
  resize,
  dispose(){api.stop();disposed=true;for(const[r]of capReq.splice(0))r(null);setGates(null);ro.disconnect();for(const[t,e,f,o]of LS)t.removeEventListener(e,f,o);const x=gl.getExtension('WEBGL_lose_context');if(x)x.loseContext();cv.remove();ov.remove();}
};
if(OPT.autoStart)api.start();
return api;
}
export default createArgusScene;
