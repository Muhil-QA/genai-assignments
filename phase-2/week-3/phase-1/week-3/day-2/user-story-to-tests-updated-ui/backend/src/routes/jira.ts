import express from 'express'
import fetch from 'node-fetch'

export const jiraRouter = express.Router()

jiraRouter.post('/connect', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { baseUrl, email, token } = req.body ?? {}

    if (!baseUrl || !email || !token) {
      res.status(400).json({
        error: 'Base URL, Email ID, and Jira API Token are required.'
      })
      return
    }

    const normalizedBaseUrl = String(baseUrl).trim().replace(/\/+$/, '')

    if (!normalizedBaseUrl || !/^https?:\/\//i.test(normalizedBaseUrl)) {
      res.status(400).json({
        error: 'Base URL must be a valid Jira site URL like https://your-company.atlassian.net'
      })
      return
    }

    const jiraAuthHeader = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${String(email).trim()}:${String(token).trim()}`).toString('base64')}`
    }

    const jiraUrl = new URL('/rest/api/3/search/jql', normalizedBaseUrl).toString()
    const issues: unknown[] = []
    let nextPageToken: string | undefined
    let metadata: Record<string, unknown> = {}

    do {
      const jiraPayload = {
        jql: 'issuetype = Story ORDER BY created DESC',
        maxResults: 50,
        fields: ['*all'],
        expand: 'names,schema',
        ...(nextPageToken ? { nextPageToken } : {})
      }

      const jiraResponse = await fetch(jiraUrl, {
        method: 'POST',
        headers: jiraAuthHeader,
        body: JSON.stringify(jiraPayload)
      })

      if (!jiraResponse.ok) {
        const errorText = await jiraResponse.text().catch(() => '')
        res.status(400).json({
          error: errorText || `Jira request failed. Check the base URL, email, and token.`
        })
        return
      }

      const data = await jiraResponse.json() as {
        issues?: unknown[]
        nextPageToken?: string
        isLast?: boolean
        names?: Record<string, unknown>
        schema?: Record<string, unknown>
      }

      issues.push(...(Array.isArray(data.issues) ? data.issues : []))
      metadata = {
        names: data.names || metadata.names || {},
        schema: data.schema || metadata.schema || {}
      }
      nextPageToken = data.isLast ? undefined : data.nextPageToken
    } while (nextPageToken)

    res.json({ ...metadata, issues })
  } catch (error) {
    console.error('Jira proxy error:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to connect to Jira from the server.'
    })
  }
})
