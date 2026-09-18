import * as XLSX from 'xlsx'
import { TestCase } from '../types'

const HEADERS = ['Test Case ID', 'Title', 'Category', 'Steps', 'Test Data', 'Expected Result']

function flattenSteps(steps: string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
}

function toRow(testCase: TestCase): (string | undefined)[] {
  return [
    testCase.id,
    testCase.title,
    testCase.category,
    flattenSteps(testCase.steps),
    testCase.testData || '',
    testCase.expectedResult
  ]
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function slugifyFilename(storyTitle: string | undefined): string {
  const slug = (storyTitle || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug ? `test-cases-${slug}` : 'test-cases'
}

export function exportToCsv(cases: TestCase[], filename: string): void {
  const rows = [HEADERS, ...cases.map(toRow)]
  const csvBody = rows
    .map(row => row.map(field => escapeCsvField(String(field ?? ''))).join(','))
    .join('\r\n')

  const blob = new Blob(['﻿' + csvBody], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, filename)
}

export function exportToExcel(cases: TestCase[], filename: string): void {
  const rows = cases.map(testCase => {
    const row = toRow(testCase)
    return HEADERS.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = String(row[index] ?? '')
      return acc
    }, {})
  })

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases')
  XLSX.writeFile(workbook, filename)
}
