import { join } from 'path'
import navData  from '../content/nav.json'

export const DOCS_ROOT = join(__dirname, '..', 'content')

export interface NavPage    { title: string; slug: string }
export interface NavSection { title: string; slug: string; pages: NavPage[] }
export interface Nav        { sections: NavSection[] }

export const nav = navData satisfies Nav
