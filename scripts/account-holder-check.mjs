// Checks "is this adult swimmer the account holder" (lib/account-holder.ts,
// audit F15): the age line and the name match the birthday card falls back to
// when the family has not ticked "this swimmer is me".
//
//   node scripts/account-holder-check.mjs

import { readFileSync } from 'node:fs'
import ts from 'typescript'

const src = readFileSync(new URL('../lib/account-holder.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { ageOn, isAdultOn, nameLooksLikeHolder, accountHolderOf, missingHolderColumn, foldName } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

let fails = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fails++; console.log(`  FAIL  ${label}\n        得到 ${JSON.stringify(got)}\n        應為 ${JSON.stringify(want)}`) }
  else console.log(`  ok    ${label} = ${JSON.stringify(got)}`)
}

console.log('\n年齡（18 歲才算成人）')
eq('生日前一天 17 歲', ageOn('2008-10-17', '2026-10-16'), 17)
eq('生日當天 18 歲', ageOn('2008-10-16', '2026-10-16'), 18)
eq('生日當天算成人', isAdultOn('2008-10-16', '2026-10-16'), true)
eq('前一天不算成人', isAdultOn('2008-10-17', '2026-10-16'), false)
eq('沒有生日不算成人', isAdultOn('', '2026-10-16'), false)

console.log('\n名字比對（只比整個姓名）')
eq('中文：名字 小明 + 姓氏 王 = 王小明', nameLooksLikeHolder('王小明', '小明', '王'), true)
eq('中文有空白：王 小明', nameLooksLikeHolder('王 小明', '小明', '王'), true)
eq('名在前：小明王', nameLooksLikeHolder('小明王', '小明', '王'), true)
eq('英文全名相同', nameLooksLikeHolder('Jane Doe', 'Jane', 'Doe'), true)
eq('姓在前：Doe Jane', nameLooksLikeHolder('Doe Jane', 'Jane', 'Doe'), true)
eq('大小寫不同', nameLooksLikeHolder('JANE DOE', 'jane', 'doe'), true)
eq('全形字母 (NFKC)', nameLooksLikeHolder('Ｊａｎｅ Ｄｏｅ', 'Jane', 'Doe'), true)
eq('John Smith 的兒子 John Smith Jr. 不是家長', nameLooksLikeHolder('John Smith Jr.', 'John', 'Smith'), false)
eq('José Luis García 的兒子 José García 不是家長', nameLooksLikeHolder('José García', 'José Luis', 'García'), false)
eq('José Luis García 本人', nameLooksLikeHolder('José Luis García', 'José Luis', 'García'), true)
eq('只有名字相同（Jane Smith / Jane Doe）不算', nameLooksLikeHolder('Jane Smith', 'Jane', 'Doe'), false)
eq('孩子：王小華 不是 王小明', nameLooksLikeHolder('王小華', '小明', '王'), false)
eq('暱稱仍判斷不出（要靠勾選）', nameLooksLikeHolder('Jen Doe', 'Jennifer', 'Doe'), false)
eq('家長沒有姓氏', nameLooksLikeHolder('Jane', 'Jane', ''), false)
eq('foldName', foldName(' Ｊａｎｅ  Doe '), 'janedoe')

console.log('\n誰是帳號本人（accountHolderOf，2026-10-16 為基準日）')
const D = '2026-10-16'
const adult = (id, name, flag) => ({ id, full_name: name, date_of_birth: '1990-05-01', is_account_holder: flag })
const kid = (id, name, flag) => ({ id, full_name: name, date_of_birth: '2016-05-01', is_account_holder: flag })
eq('舊帳號：王小明（未設定）+ 一個小孩 → 名字比對成立', accountHolderOf([adult('a', '王小明', null), kid('k', '王小華', null)], '小明', '王', D), 'a')
eq('欄位不存在（undefined）也走名字比對', accountHolderOf([adult('a', '王小明', undefined)], '小明', '王', D), 'a')
eq('明確 false：名字相同也不是本人', accountHolderOf([adult('a', '王小明', false)], '小明', '王', D), null)
eq('勾了 A：B 名字相同也不是', accountHolderOf([adult('a', 'Mary Smith', true), adult('b', 'John Smith', null)], 'John', 'Smith', D), 'a')
eq('勾了 A（A 名字不同）仍是 A', accountHolderOf([adult('a', 'Johnny', true)], 'John', 'Smith', D), 'a')
eq('兩位成人都未設定：不靠名字猜', accountHolderOf([adult('a', 'John Smith', null), adult('b', 'Mary Smith', null)], 'John', 'Smith', D), null)
eq('John Smith 家：成人兒子 John Smith Jr.（未設定）不是本人', accountHolderOf([adult('s', 'John Smith Jr.', null)], 'John', 'Smith', D), null)
eq('José Luis García 家：成人兒子 José García 不是本人', accountHolderOf([adult('s', 'José García', null)], 'José Luis', 'García', D), null)
eq('只有小孩：沒有本人', accountHolderOf([kid('k', 'John Smith', null)], 'John', 'Smith', D), null)
eq('櫃台取消勾選（false）後就不是', accountHolderOf([adult('a', 'John Smith', false), kid('k', 'Tom Smith', null)], 'John', 'Smith', D), null)

console.log('\n欄位不存在的錯誤')
eq('42703', missingHolderColumn({ code: '42703', message: 'column students.is_account_holder does not exist' }), true)
eq('PGRST204', missingHolderColumn({ code: 'PGRST204', message: "Could not find the 'is_account_holder' column" }), true)
eq('其他錯誤', missingHolderColumn({ code: '23505', message: 'duplicate key' }), false)
eq('沒有錯誤', missingHolderColumn(null), false)

console.log(fails ? `\n${fails} 項失敗` : '\n全部通過')
process.exit(fails ? 1 : 0)
