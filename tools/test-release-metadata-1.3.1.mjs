import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function readJson(relativePath){
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message){
  if(!condition){
    console.error("FALHA:", message);
    process.exit(1);
  }
}

const config = fs.readFileSync(
  path.join(root, "backend/apps-script/00_Config.js"),
  "utf8"
);
const packageJson = readJson("frontend/package.json");
const lockJson = readJson("frontend/package-lock.json");
const manifest = readJson("release/fab-control.release.json");
const snapshot = readJson("release/spreadsheet-schema.snapshot.json");

assert(
  config.includes('const FAB_RELEASE_VERSION = "1.3.1";'),
  "backend não declara 1.3.1"
);
assert(packageJson.version === "1.3.1", "package.json não declara 1.3.1");
assert(lockJson.version === "1.3.1", "package-lock raiz não declara 1.3.1");
assert(
  lockJson.packages?.[""]?.version === "1.3.1",
  "package-lock do pacote não declara 1.3.1"
);

assert(manifest.release === "1.3.1", "manifesto não declara 1.3.1");
assert(
  manifest.status === "production-bootstrap-canary-homologated",
  "status canário do candidato incorreto"
);

for(const component of [
  "frontend",
  "backendApi",
  "apiContract",
  "spreadsheetSchema"
]){
  assert(
    manifest.components?.[component] === "1.3.1",
    "componente fora da versão 1.3.1: " + component
  );
}

assert(
  manifest.target?.backendSourceSha256 === "5ADCA155756E1E2AF22AC18D9601BC439F8558E47948AFFB9CFD5B905EB896CC",
  "hash final do backend incorreto"
);
assert(manifest.target?.gitCommit === "84f9c1b", "commit-fonte final incorreto");
assert(
  manifest.target?.immutableAppsScriptVersion === 3,
  "versão imutável final incorreta"
);
assert(
  manifest.target?.deploymentId === "AKfycbwlwv8vWkiaGR2HlK5-eIrwC_Ltha1qrH6n-kMsPb3bukqL33qxQtszSIM-unq1tbWKJw",
  "deployment final incorreto"
);

const bootstrap = manifest.features?.productionBootstrap;
assert(bootstrap?.status === "canary-homologated", "bootstrap sem homologação canária");
assert(bootstrap?.requiresEmptySpreadsheet === true, "gate de planilha vazia ausente");
assert(bootstrap?.demoSeeded === false, "manifesto permite seed Demo");
assert(
  bootstrap?.readinessDiagnosticReadOnly === true,
  "diagnóstico não está marcado como somente leitura"
);
assert(
  bootstrap?.remoteValidation === "approved",
  "homologação remota do bootstrap não está aprovada"
);

assert(
  manifest.homologationEvidence?.appliesToRelease === "1.3.0",
  "evidência anterior deve continuar vinculada à 1.3.0"
);
assert(
  manifest.candidateEvidence?.release === "1.3.1",
  "evidência do candidato ausente"
);
assert(
  manifest.candidateEvidence?.frontendBuild === "approved",
  "build do frontend deve estar aprovado"
);
assert(
  manifest.candidateEvidence?.remoteCanary === "approved",
  "canário remoto não está aprovado"
);

const canary = manifest.canaryEvidence;
assert(canary?.environment === "isolated", "canário não está isolado");
assert(canary?.release === "1.3.1", "release canária incorreta");
assert(canary?.backendSourceSha256 === "5ADCA155756E1E2AF22AC18D9601BC439F8558E47948AFFB9CFD5B905EB896CC", "evidência do hash ausente");

const bootstrapPhase = canary?.phases?.bootstrapAndFirstAccess;
assert(
  bootstrapPhase?.immutableAppsScriptVersion === 2,
  "fase de bootstrap deve permanecer vinculada à versão @2"
);
assert(
  bootstrapPhase?.sourceGitCommit === "a30a7ea",
  "commit da fase de bootstrap incorreto"
);
assert(
  bootstrapPhase?.deploymentId === "AKfycbyU6MBRAmtSrmBcZ1H1UruWquMCJoy95jgz_9SF9rJGDWmebb68HHF5DWl1dL2H4dtF",
  "deployment da fase de bootstrap incorreto"
);
for(const check of [
  "productionSchema",
  "initialAdminBootstrap",
  "temporaryPasswordCleared",
  "firstAccess"
]){
  assert(
    bootstrapPhase?.[check] === "approved",
    "evidência da fase de bootstrap ausente: " + check
  );
}

const finalPhase = canary?.phases?.finalCandidate;
assert(
  finalPhase?.immutableAppsScriptVersion === 3,
  "fase final deve estar vinculada à versão @3"
);
assert(finalPhase?.sourceGitCommit === "84f9c1b", "commit da fase final incorreto");
assert(finalPhase?.deploymentId === "AKfycbwlwv8vWkiaGR2HlK5-eIrwC_Ltha1qrH6n-kMsPb3bukqL33qxQtszSIM-unq1tbWKJw", "deployment da fase final incorreto");
for(const check of [
  "health",
  "bootstrap",
  "permanentAdminLogin",
  "authenticatedAdminRead",
  "remoteLogout",
  "revokedTokenRejected",
  "readinessAfterRevokedSessions"
]){
  assert(
    finalPhase?.[check] === "approved",
    "evidência da fase final ausente: " + check
  );
}

assert(finalPhase?.activeSessions === 0, "canário possui sessão ativa");
assert(finalPhase?.operationalRows === 0, "canário possui dados operacionais");
assert(finalPhase?.syntheticRows === 0, "canário possui dados sintéticos");

assert(snapshot.release === "1.3.1", "snapshot não declara release 1.3.1");
assert(snapshot.schemaVersion === "1.3.1", "snapshot não declara schema 1.3.1");
assert(snapshot.declaredSheetCount === 32, "quantidade de abas alterada");
assert(
  snapshot.productionBootstrap?.demoSeeded === false,
  "snapshot permite seed Demo"
);
assert(
  snapshot.productionBootstrap?.readinessDiagnosticReadOnly === true,
  "snapshot não declara diagnóstico somente leitura"
);

console.log("TESTE DOS METADADOS DA RELEASE 1.3.1 APROVADO");
console.log("Evidências canárias vinculadas às versões @2 e @3 corretas");
