function now_(){ return Utilities.formatDate(new Date(), FAB.TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function iso_(d){ return Utilities.formatDate(d, FAB.TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function addHours_(d,h){ return new Date(d.getTime()+Number(h||0)*3600000); }
function addSeconds_(d,s){ return new Date(d.getTime()+Number(s||0)*1000); }
function clean_(v){ return String(v == null ? "" : v).trim(); }
function upper_(v){ return clean_(v).toUpperCase(); }
function num_(v,f){ var n = Number(v); return isNaN(n) ? Number(f||0) : n; }
function bool_(v){ var s = upper_(v); return v === true || s === "SIM" || s === "TRUE" || s === "1" || s === "YES"; }
function uuid_(p){ return String(p||"ID") + "-" + Utilities.getUuid().replace(/-/g,"").slice(0,10).toUpperCase(); }
function slug_(v){ return clean_(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70); }
function eid_(p,v){ return p + "-" + (slug_(v) || Utilities.getUuid().slice(0,8).toUpperCase()); }
function err_(code,msg,status){ var e = new Error(msg); e.code = code; e.status = status || 400; throw e; }
function req_(o, fields){ fields.forEach(function(f){ if(clean_(o && o[f]) === "") err_("FIELD_REQUIRED","Campo obrigatório: "+f,400); }); }
function strip_(o){ var x = Object.assign({}, o || {}); delete x.__rowIndex; return x; }
function j_(o){ return JSON.stringify(o || {}); }
function hashPin_(pin){ return sha256_("FAB-CONTROL:" + String(pin || "")); }
function sha256_(value){
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value||""), Utilities.Charset.UTF_8);
  return bytes.map(function(b){ var v=(b<0?b+256:b).toString(16); return v.length===1?"0"+v:v; }).join("");
}
function normCell_(v){
  if(v instanceof Date) return iso_(v);
  if(v === null || v === undefined) return "";
  return v;
}
function normErr_(e){ return { code:e.code || "INTERNAL_ERROR", status:e.status || 500, message:e.message || "Erro interno." }; }
function sortByDateDesc_(field){
  return function(a,b){ return String(b[field]||"").localeCompare(String(a[field]||"")); };
}
function priorityScore_(p){
  p = upper_(p);
  if(p === "CRITICA") return 4;
  if(p === "ALTA") return 3;
  if(p === "MEDIA") return 2;
  return 1;
}
function acaoAberta_(a){
  return [ST.CONCLUIDA, ST.CANCELADA].indexOf(upper_(a.status)) < 0;
}
function terminal_(status){
  return [ST.CONCLUIDA, ST.CANCELADA].indexOf(upper_(status)) >= 0;
}
function respostaCritica_(r){
  return ["NOK","NAO_OK","IMPEDIDO"].indexOf(upper_(r)) >= 0;
}
function jsonOut_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
