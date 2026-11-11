import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {format} from "prettier";
const target=new URL("../src/atmosphere/generated/",import.meta.url);mkdirSync(target,{recursive:true});
for(const name of ["display","surface"]){
 const source=new URL(`../src/atmosphere/${name}.wgsl`,import.meta.url);
 const code=`// Generated from ${name}.wgsl. Run npm run shaders.\nexport const ${name}Shader = `+JSON.stringify(readFileSync(source,"utf8"))+";\n";
 writeFileSync(new URL(`${name}.ts`,target),await format(code,{parser:"typescript",tabWidth:4,printWidth:140}));
}

const oceanTarget=new URL("../src/ocean/generated/",import.meta.url);mkdirSync(oceanTarget,{recursive:true});
const oceanSource=readFileSync(new URL("../src/ocean/surface.wgsl",import.meta.url),"utf8");
writeFileSync(new URL("surface.ts",oceanTarget),await format("// Generated from ocean/surface.wgsl. Run npm run shaders.\nexport const oceanShader = "+JSON.stringify(oceanSource)+";\n",{parser:"typescript",tabWidth:4,printWidth:140}));
