import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default [
  // ES and CJS builds with external dependencies
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'es',
        sourcemap: true
      },
      {
        file: 'dist/index.cjs.js',
        format: 'cjs',
        sourcemap: true
      }
    ],
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.COOKIE_HANDOVER_URL': JSON.stringify(process.env.COOKIE_HANDOVER_URL || ''),
        'process.env.TOKEN_HANDOVER_URL': JSON.stringify(process.env.TOKEN_HANDOVER_URL || ''),
        'process.env.OS_HANDOVER_URL': JSON.stringify(process.env.OS_HANDOVER_URL || '')
      }),
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
      })
    ],
    external: []
  },
  // Browser build - bundle everything
  {
    input: 'src/index.browser.ts',
    output: {
      file: 'dist/index.browser.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.COOKIE_HANDOVER_URL': JSON.stringify(process.env.COOKIE_HANDOVER_URL || ''),
        'process.env.TOKEN_HANDOVER_URL': JSON.stringify(process.env.TOKEN_HANDOVER_URL || ''),
        'process.env.OS_HANDOVER_URL': JSON.stringify(process.env.OS_HANDOVER_URL || '')
      }),
      nodeResolve({
        browser: true
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        module: 'esnext'
      })
    ]
  }
];