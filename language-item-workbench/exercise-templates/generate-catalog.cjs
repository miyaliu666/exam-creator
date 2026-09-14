/* Regenerate with: node language-item-workbench/exercise-templates/generate-catalog.cjs <source-project-directory> */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../../node_modules/typescript');
const root = path.resolve(process.argv[2] || (() => { throw Error('Supply the exercise template source project directory.'); })());
const out = __dirname;
function parse(relative) {
  const code = fs.readFileSync(path.join(root, relative), 'utf8');
  const file = ts.createSourceFile(relative, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const variables = new Map();
  for (const stmt of file.statements) if (ts.isVariableStatement(stmt)) for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name)) variables.set(d.name.text, d.initializer);
  return {code,file,variables};
}
const source = parse('src/lib/schema.ts');
const env = source.variables;
function plain(n, variables = env) {
  if (!n) return undefined;
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return ts.isNumericLiteral(n) ? +n.text : n.text;
  if (ts.isArrayLiteralExpression(n)) return n.elements.map(v=>plain(v,variables));
  if (ts.isObjectLiteralExpression(n)) return Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).map(p=>[p.name.text,plain(p.initializer,variables)]));
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isIdentifier(n) && variables.has(n.text)) return plain(variables.get(n.text),variables);
  if (ts.isAsExpression(n)) return plain(n.expression,variables);
  if (ts.isBinaryExpression(n) && n.operatorToken.kind===ts.SyntaxKind.PlusToken) return plain(n.left,variables)+plain(n.right,variables);
  throw Error('Unsupported literal: '+n.getText());
}
function properties(n) {
  if (!ts.isObjectLiteralExpression(n)) throw Error('Expected object: '+n.getText());
  return Object.fromEntries(n.properties.map(p=>[p.name.text,evaluate(ts.isShorthandPropertyAssignment(p)?p.name:p.initializer)]));
}
function evaluate(n) {
  if (ts.isIdentifier(n)) { if(!env.has(n.text))throw Error('Unknown '+n.text);return evaluate(env.get(n.text)); }
  if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) throw Error('Unsupported schema: '+n.getText());
  const method=n.expression.name.text, owner=n.expression.expression;
  if (ts.isIdentifier(owner) && owner.text==='z') {
    if(method==='object')return{type:'object',required:true,properties:properties(n.arguments[0])};
    if(method==='array')return{type:'array',required:true,element:evaluate(n.arguments[0])};
    if(method==='union')return{type:'union',required:true,variants:n.arguments[0].elements.map(evaluate)};
    if(method==='enum'||method==='literal')return{type:method,required:true,values:method==='literal'?[plain(n.arguments[0])]:plain(n.arguments[0])};
    if(['string','number','boolean'].includes(method))return{type:method,required:true};
    throw Error('Unsupported Zod type '+method);
  }
  const v=evaluate(owner);
  if(method==='extend')return{...v,properties:{...v.properties,...properties(n.arguments[0])}};
  if(method==='optional')return{...v,required:false};
  if(method==='default')return{...v,required:false,default:plain(n.arguments[0])};
  if(method==='describe')return{...v,description:plain(n.arguments[0])};
  if(method==='int')return{...v,type:'integer'};
  if(method==='refine'||method==='superRefine')return{...v,sourceRefinements:[...(v.sourceRefinements||[]),n.arguments.map(a=>a.getText()).join(', ')]};
  if(['min','max','length'].includes(method)) {
    const suffix=v.type==='array'?'Items':v.type==='string'?'Length':'';
    const low=suffix?'min'+suffix:'minimum',high=suffix?'max'+suffix:'maximum';
    return{...v,...(method!=='max'?{[low]:plain(n.arguments[0])}:{}),...(method!=='min'?{[high]:plain(n.arguments[0])}:{})};
  }
  if(method==='positive')return{...v,exclusiveMinimum:0};
  if(method==='nonnegative')return{...v,minimum:0};
  throw Error('Unsupported schema modifier '+method);
}
function label(key) { return key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,v=>v.toUpperCase()); }
function field(key,v) {
  const {properties,element,variants,...rest}=v;
  return{key,label:label(key),...rest,...(properties?{properties:Object.entries(properties).map(([k,c])=>field(k,c))}:{}),...(element?{element:field('entry',element)}:{}),...(variants?{variants:variants.map((v,i)=>field('option'+(i+1),v))}:{})};
}
function jsonSchema(v) {
  const schema={};
  if(v.type==='union')schema.anyOf=v.variants.map(jsonSchema);
  else if(v.type==='enum'){schema.type=typeof v.values[0];schema.enum=v.values;}
  else if(v.type==='literal'){schema.type=typeof v.values[0];schema.const=v.values[0];}
  else schema.type=v.type;
  for(const key of ['description','default','minimum','maximum','exclusiveMinimum','minItems','maxItems','minLength','maxLength'])if(v[key]!==undefined)schema[key]=v[key];
  if(v.properties){schema.properties=Object.fromEntries(Object.entries(v.properties).map(([k,c])=>[k,jsonSchema(c)]));schema.required=Object.entries(v.properties).filter(([,c])=>c.required).map(([k])=>k);schema.additionalProperties=true;}
  if(v.element)schema.items=jsonSchema(v.element);
  if(v.sourceRefinements)schema['x-sourceRefinements']=v.sourceRefinements;
  return schema;
}
const registry=parse('src/lib/registry.ts');
const registered=registry.variables.get('registry').properties.map(p=>({id:p.name.text,component:p.initializer.text}));
const namesSource=parse('src/App.tsx');
const names=plain(namesSource.variables.get('TYPE_LABELS'),namesSource.variables);
const supportSource=parse('src/lib/levelSupport.ts');
const skills=plain(supportSource.variables.get('SKILL_FOR_TYPE'),supportSource.variables);
const levels=plain(supportSource.variables.get('LEVEL_SUPPORT'),supportSource.variables);
const policies=JSON.parse(fs.readFileSync(path.join(out,'projection-policies.json'),'utf8'));
function privatePaths(value,prefix='') {
  const found=[];
  for(const [key,child] of Object.entries(value.properties||{})) {
    const current=prefix?prefix+'.'+key:key;
    if(policies.privateFieldNames.includes(key))found.push(current);
    else found.push(...privatePaths(child,current));
  }
  if(value.element)found.push(...privatePaths(value.element,prefix+'.*'));
  if(value.variants)for(const variant of value.variants)found.push(...privatePaths(variant,prefix));
  return found;
}
const definitions=registered.map(({id,component})=>{
  const schemaName=env.get('schemas').expression.properties.find(p=>p.name.text===id).initializer.text;
  const value=evaluate(env.get(schemaName));
  const schema=jsonSchema(value);
  schema.$schema='http://json-schema.org/draft-07/schema#';
  if(id==='diagram-label'||id==='listening-diagram-label')schema.allOf=[{if:{properties:{layout:{enum:id==='diagram-label'?['diagram']:['diagram','plan','map']}},required:['layout']},then:{required:['image']},else:{required:['content']}}];
  // Zod applies the default diagram layout before refinement.
  if(id==='diagram-label'||id==='listening-diagram-label')schema.allOf[0].if.anyOf=[{not:{required:['layout']}},{properties:{layout:{enum:id==='diagram-label'?['diagram']:['diagram','plan','map']}},required:['layout']}];
  if(schema.allOf){delete schema.allOf[0].if.properties;delete schema.allOf[0].if.required;}
  if(id==='multiple-choice-single-answer'){
    const q=schema.properties.questions.items;
    schema.properties.questions.items=Array.from({length:5},(_,i)=>({...q,properties:{...q.properties,correct:i<4?q.properties.correct.anyOf[0]:q.properties.correct.anyOf[1]}}));
    schema.properties.questions.additionalItems=false;
  }
  const override=policies.overrides[id]||{};
  const projection={version:1,privatePaths:[...new Set([...privatePaths(value),...(override.privatePaths||[])])],transform:override.transform||'none'};
  return{id,name:names[id],component,sourceSkill:skills[id]||null,sourceSupportedLevels:levels[id],description:`${names[id]} exercise. Configure its materials, response requirements, and assessment rules.`,fields:Object.entries(value.properties).map(([k,v])=>field(k,v)),schema,projection};
});
if(definitions.length!==60||definitions.some(d=>!d.name||!d.fields.length))throw Error('Incomplete source catalog');
fs.mkdirSync(path.join(out,'source','lib'),{recursive:true});
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify({schemaVersion:1,sourceProject:'markdown-exercise-templates',sourceSchemaSha256:crypto.createHash('sha256').update(source.code).digest('hex'),commonFields:Object.keys(evaluate(env.get('base')).properties),templates:definitions},null,2)+'\n');
// Copy the exact source renderer dependency closure, leaving editor/app routing behind.
const sources=['src/lib/schema.ts','src/lib/registry.ts','src/lib/grading.ts','src/lib/segment.ts','src/lib/pronunciation.ts','src/lib/i18n.ts','src/lib/levelSupport.ts','src/lib/characters.ts','src/components/Shell.tsx','src/components/QuestionList.tsx','src/components/CharacterHelper.tsx','src/templates/types.ts','src/styles.css','src/speech.d.ts',...registered.map(t=>`src/templates/${t.component}.tsx`)];
const hashes=[];
for(const relative of sources){
 const content=fs.readFileSync(path.join(root,relative));const target=path.join(out,'source',relative.replace(/^src\//,''));fs.mkdirSync(path.dirname(target),{recursive:true});
 let adapted=content.toString('utf8');
 if(relative==='src/components/Shell.tsx') {
   adapted=adapted.replace("import { marked } from 'marked';","import { Marked } from 'marked';\nimport DOMPurify from 'dompurify';");
   adapted=adapted.replace("marked.setOptions({ gfm: true, breaks: true });","const markdown = new Marked({ gfm: true, breaks: true });\n// Workbench content is authored/AI-generated: sanitize HTML and URL attributes.\nfunction renderMarkdown(content: string): string {\n  return DOMPurify.sanitize(markdown.parse(content) as string, { USE_PROFILES: { html: true }, ADD_ATTR: ['data-blank-index'] });\n}");
   adapted=adapted.replaceAll('marked.parse(', 'renderMarkdown(').replace('Content is trusted (local files).','Content is sanitized before rendering.');
 }
 if(relative==='src/components/CharacterHelper.tsx')adapted=adapted.replace('const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;', 'let focused = document.activeElement;\n  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;\n  const el = focused as HTMLInputElement | HTMLTextAreaElement | null;');
 if(relative==='src/templates/Speaking.tsx')adapted=adapted.replace('CUES_HEADING[data.language]', 'CUES_HEADING[uiLang]');
 fs.writeFileSync(target,adapted);hashes.push({path:relative,sha256:crypto.createHash('sha256').update(content).digest('hex'),...(adapted!==content.toString('utf8')?{adapted:true}:{})});
}
fs.writeFileSync(path.join(out,'source-manifest.json'),JSON.stringify({sourceProject:'markdown-exercise-templates',files:hashes},null,2)+'\n');
console.log(`Generated ${definitions.length} templates and vendored ${sources.length} source files.`);
