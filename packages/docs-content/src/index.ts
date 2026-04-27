import { join } from 'path'
import navData              from '../content/nav.json'
import featureComparisonData from '../content/feature-comparison.json'
import glossaryData          from '../content/glossary.json'

export const DOCS_ROOT = join(__dirname, '..', 'content')

export interface NavPage    { title: string; slug: string }
export interface NavSection { title: string; slug: string; pages: NavPage[] }
export interface Nav        { sections: NavSection[] }

export const nav = navData satisfies Nav

export interface FeatureComparisonColumn { key: string; label: string }
export interface FeatureComparisonRow { feature: string; [key: string]: boolean | string }
export interface FeatureComparison { columns: FeatureComparisonColumn[]; rows: FeatureComparisonRow[] }

export interface GlossaryTerm { term: string; definition: string }
export interface Glossary { terms: GlossaryTerm[] }

export const featureComparison = featureComparisonData satisfies FeatureComparison
export const glossary          = glossaryData satisfies Glossary
