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
  manifest.status === "production-bootstrap-local-validated",
  "status do candidato incorreto"
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
  manifest.target?.backendSourceSha256 === "PENDING_AFTER_COMMIT",
  "hash remoto não deve ser inventado antes do commit"
);
assert(
  manifest.target?.gitCommit === "PENDING_AFTER_COMMIT",
  "commit remoto não deve ser inventado antes do commit"
);
assert(
  manifest.target?.immutableAppsScriptVersion === null,
  "versão imutável deve permanecer pendente"
);
assert(
  manifest.target?.deploymentId === null,
  "deployment deve permanecer pendente"
);

const bootstrap = manifest.features?.productionBootstrap;
assert(bootstrap?.status === "local-contract-approved", "bootstrap sem aprovação local");
assert(bootstrap?.requiresEmptySpreadsheet === true, "gate de planilha vazia ausente");
assert(bootstrap?.demoSeeded === false, "manifesto permite seed Demo");
assert(
  bootstrap?.readinessDiagnosticReadOnly === true,
  "diagnóstico não está marcado como somente leitura"
);
assert(
  bootstrap?.remoteValidation === "pending",
  "homologação remota não pode estar aprovada ainda"
);

assert(
  manifest.homologationEvidence?.appliesToRelease === "1.3.0",
  "evidência anterior deve continuar vinculada à 1.3.0"
);
assert(
  manifest.candidateEvidence?.release === "1.3.1",
  "evidência local do candidato ausente"
);
assert(
  manifest.candidateEvidence?.frontendBuild === "approved",
  "build do frontend deve estar aprovado"
);

assert(
  manifest.candidateEvidence?.remoteCanary === "pending",
  "canário remoto não pode estar aprovado ainda"
);

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
