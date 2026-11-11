Document Question Answering (Document QA) Agent - n8n

An AI-powered Document QA agent built using n8n that allows users to extract document content and ask grounded questions based strictly on the file source.

Workflow Pipeline
1. Manual Trigger: Starts the workflow execution and holds pinned question data.
2. Read/Write Files from Disk: Loads the target document binary data from disk.
3. Extract from File: Parses binary data into clean text.
4. Basic LLM Chain: Combines extracted text, user query and OpenAI to answer accurately without hallucinations.

Setup & How to Run
1. Import `document-qa-agent.json` into your local n8n instance.
2. Place your target file inside `C:\Users\<username>\.n8n-files\` and update the file path in Node 2.
3. Set your OpenAI API credentials in Node 4.
4. Pin your test question in Node 1.
5. Click Execute Workflow.