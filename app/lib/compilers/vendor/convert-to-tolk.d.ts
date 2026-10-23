// From @ton/convert-func-to-tolk 1.0.0 dist/convert-to-tolk.d.ts
export interface ConvertFunCToTolkOptions {
  shouldInsertWarningsAsComments: boolean
  transformFunctionNamesToCamelCase: boolean
  transformLocalVarNamesToCamelCase: boolean
}
export interface FunCToTolkConvertionResult {
  tolkSource: string
  warnings: { text: string, lineNo: number, colNo: number }[]
}
export declare function convertFunCToTolk(funCSource: string, options?: Partial<ConvertFunCToTolkOptions>): FunCToTolkConvertionResult
