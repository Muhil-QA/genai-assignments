import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip,
  LinearProgress,
  Grid,
  Fade,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  Refresh as RefreshIcon,
  PlayArrow as PlayArrowIcon,
  Settings as SettingsIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Storage as StorageIcon,
  InsertDriveFile as FileIcon,
  RocketLaunch as RocketLaunchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

function EmbeddingsStore() {
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [targetCollection, setTargetCollection] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);
  const { enqueueSnackbar } = useSnackbar();

  // Enhanced file data validation
  const validateFiles = (fileList) => {
    return (fileList || []).filter(file => 
      file && 
      typeof file === 'object' && 
      file.name && 
      typeof file.size === 'number' &&
      file.modified
    );
  };

  // DataGrid v8 requires GridRowSelectionModel: { type: 'include' | 'exclude', ids: Set<GridRowId> }
  const rowSelectionModel = React.useMemo(() => ({
    type: 'include',
    ids: new Set(selectedFiles)
  }), [selectedFiles]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/files`);
      const validatedFiles = validateFiles(response.data || []);
      console.log('📁 Raw files:', response.data);
      console.log('📁 Validated files:', validatedFiles);
      
      setFiles(validatedFiles);
      enqueueSnackbar(`Loaded ${validatedFiles.length} files`, { variant: 'success' });
    } catch (err) {
      const errorMessage = 'Failed to load files';
      setError(errorMessage);
      enqueueSnackbar(errorMessage, { variant: 'error' });
      console.error('❌ Load files error:', err);
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  // Always mount in clean idle state - embeddings only start on explicit user action
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Poll for job status only when actively processing an explicit user-initiated job
  useEffect(() => {
    if (!currentJobId || !processing) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE}/jobs/${currentJobId}`);
        const job = response.data;
        
        setJobProgress(job);
        
        if (job.status === 'completed') {
          setProcessing(false);
          setResults(job.results || []);
          setCurrentJobId(null);
          setJobProgress(null);
          
          const successful = (job.results || []).filter(r => r.status === 'completed').length;
          const failed = (job.results || []).filter(r => r.status === 'failed').length;
          
          if (failed === 0) {
            enqueueSnackbar(`Successfully processed all ${successful} files!`, { variant: 'success' });
          } else {
            enqueueSnackbar(`Processed ${successful} files, ${failed} failed`, { variant: 'warning' });
          }
          
          clearInterval(pollInterval);
        } else if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'interrupted') {
          setProcessing(false);
          setResults(job.results || []);
          setCurrentJobId(null);
          setJobProgress(null);
          enqueueSnackbar(job.message || 'Embedding job ended or was interrupted.', { variant: 'warning' });
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Failed to poll job status:', err);
        clearInterval(pollInterval);
        setProcessing(false);
        setCurrentJobId(null);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentJobId, processing, enqueueSnackbar]);

  const handleCancelJob = async () => {
    if (!currentJobId) {
      setProcessing(false);
      setJobProgress(null);
      return;
    }
    try {
      await axios.post(`${API_BASE}/jobs/${currentJobId}/cancel`);
      enqueueSnackbar('Embedding job cancelled', { variant: 'info' });
    } catch (e) {
      console.warn('Failed to cancel job on server:', e);
    } finally {
      setProcessing(false);
      setCurrentJobId(null);
      setJobProgress(null);
    }
  };

  // Debug: Add useEffect to monitor selectedFiles changes
  useEffect(() => {
    console.log('🔄 selectedFiles state changed:', selectedFiles);
  }, [selectedFiles]);


  const handleSelectionChange = (newSelection) => {
    console.log('🔍 Selection changed:', newSelection);
    console.log('🔍 Selection type:', typeof newSelection);
    console.log('🔍 Is array:', Array.isArray(newSelection));
    
    try {
      let selectedFileNames = [];
      
      if (Array.isArray(newSelection)) {
        // Old format: direct array of IDs
        selectedFileNames = newSelection.filter(Boolean);
      } else if (newSelection && typeof newSelection === 'object') {
        // New format: object with type and ids
        if (newSelection.type === 'include' && newSelection.ids) {
          // Include selection: use the IDs directly
          selectedFileNames = Array.from(newSelection.ids).filter(Boolean);
        } else if (newSelection.type === 'exclude' && newSelection.ids) {
          // Exclude selection: select all files except the excluded ones
          const excludedIds = new Set(newSelection.ids);
          selectedFileNames = files
            .map(file => file.name)
            .filter(name => !excludedIds.has(name));
        }
      }
      
      console.log('🔍 Processed selection:', selectedFileNames);
      setSelectedFiles(selectedFileNames);
      console.log('🔍 State will be updated to:', selectedFileNames);
    } catch (error) {
      console.error('❌ Error in handleSelectionChange:', error);
      enqueueSnackbar('Selection error: ' + error.message, { variant: 'error' });
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString();
  };

  const isUserStoryFile = (fileName) => {
    const fn = (fileName || '').toLowerCase();
    return fn.includes('stor') || fn.includes('story');
  };

  const detectedCategory = selectedFiles.some(isUserStoryFile) ? 'user-stories' : 'testcases';
  const effectiveJobType = targetCollection === 'auto' ? detectedCategory : targetCollection;
  const effectiveCollectionName = effectiveJobType === 'user-stories' ? 'user_stories' : 'test_cases';

  const handleCreateEmbeddings = async () => {
    if (selectedFiles.length === 0) {
      enqueueSnackbar('Please select at least one converted JSON file (Test Cases or User Stories)', { variant: 'warning' });
      return;
    }

    setProcessing(true);
    setError(null);
    setResults([]);
    setJobProgress(null);

    try {
      const scriptName = effectiveJobType === 'user-stories'
        ? 'create-userstories-embeddings-batch-mistral.js'
        : 'create-embeddings-batch-mistral.js';

      enqueueSnackbar(`Starting batch embedding for ${selectedFiles.length} file(s) into MongoDB collection '${effectiveCollectionName}'...`, { variant: 'info' });
      
      console.log(`📊 Processing ${selectedFiles.length} file(s) -> JobType: ${effectiveJobType}, Target Collection: ${effectiveCollectionName}`);
      console.log(`🚀 Using batch script: ${scriptName}`);
      
      // Call the batch processing endpoint
      const response = await axios.post(`${API_BASE}/create-embeddings-batch`, {
        files: selectedFiles,
        scriptName: scriptName,
        jobType: effectiveJobType
      });

      if (response.data.success) {
        const jobId = response.data.jobId;
        setCurrentJobId(jobId);
        enqueueSnackbar(`Batch processing started! Target: ${effectiveCollectionName} (Job ID: ${jobId})`, { variant: 'success' });
      } else {
        throw new Error(response.data.error || 'Failed to start batch processing');
      }
      
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Embedding creation failed';
      setError(errorMessage);
      setProcessing(false);
      enqueueSnackbar(errorMessage, { variant: 'error' });
      console.error('❌ Embedding error:', err);
    }
  };

  const columns = [
    {
      field: 'name',
      headerName: 'File Name',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FileIcon color="primary" fontSize="small" />
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      ),
    },
    {
      field: 'size',
      headerName: 'Size',
      width: 120,
      renderCell: (params) => formatFileSize(params.value),
    },
    {
      field: 'modified',
      headerName: 'Modified',
      width: 180,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: 'type',
      headerName: 'Category',
      width: 140,
      renderCell: (params) => {
        const isStory = (params.row?.name || '').toLowerCase().includes('stor');
        return (
          <Chip 
            label={isStory ? 'User Stories' : 'Test Cases'} 
            color={isStory ? 'secondary' : 'primary'} 
            size="small" 
            variant="filled" 
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
        );
      },
    },
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      case 'in-progress':
        return <ScheduleIcon color="primary" />;
      default:
        return <ScheduleIcon color="disabled" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      case 'in-progress':
        return 'primary';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '9999px',
              bgcolor: 'rgba(79, 70, 229, 0.08)',
              border: '1px solid rgba(79, 70, 229, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
            }}
          >
            <StorageIcon sx={{ fontSize: '1.15rem' }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              Embeddings & Store
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Generate vector embeddings and store test cases in MongoDB Atlas Vector Database.
            </Typography>
          </Box>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* File Management */}
        <Grid item xs={12} lg={8}>
          <Card elevation={0}>
            <CardHeader
              title="Available Files"
              subheader={`${files.length} JSON files found`}
              action={
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Settings">
                    <IconButton onClick={() => setShowSettings(true)}>
                      <SettingsIcon />
                    </IconButton>
                  </Tooltip>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={loadFiles}
                    disabled={loading}
                  >
                    Refresh
                  </Button>
                </Box>
              }
            />
            <CardContent>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : files.length === 0 ? (
                <Box sx={{ textAlign: 'center', p: 4 }}>
                  <Typography color="text.secondary">
                    No JSON files found in the data directory
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ height: 400, width: '100%' }}>
                  <DataGrid
                    rows={files}
                    columns={columns}
                    getRowId={(row) => row.name}
                    checkboxSelection
                    rowSelectionModel={rowSelectionModel}
                    onRowSelectionModelChange={handleSelectionChange}
                    density="comfortable"
                    pageSizeOptions={[5, 10, 25]}
                    initialState={{
                      pagination: {
                        paginationModel: { page: 0, pageSize: 10 },
                      },
                    }}
                    sx={{
                      '& .MuiDataGrid-cell:focus': {
                        outline: 'none',
                      },
                      '& .MuiDataGrid-row:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                  />
                </Box>
              )}

              {selectedFiles.length > 0 && (
                <Fade in={true}>
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: 'primary.50', borderRadius: 1.5, border: '1px solid', borderColor: 'primary.200', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" color="primary.main" fontWeight={700}>
                        Selected {selectedFiles.length} file(s):
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {selectedFiles.join(', ')}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      color="primary"
                      variant="outlined"
                      startIcon={<ClearIcon fontSize="small" />}
                      onClick={() => setSelectedFiles([])}
                      sx={{ textTransform: 'none', ml: 2, whiteSpace: 'nowrap' }}
                    >
                      Clear Selection
                    </Button>
                  </Box>
                </Fade>
              )}

              {processing && jobProgress && (
                <Fade in={true}>
                  <Card variant="outlined" sx={{ mt: 2, bgcolor: 'info.50', borderColor: 'info.main' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight={600} color="info.main">
                          Processing Embeddings...
                        </Typography>
                        <Chip 
                          label={`${jobProgress.progress}/${jobProgress.total}`} 
                          color="info" 
                          size="small"
                        />
                      </Box>
                      
                      {jobProgress.currentFile && (
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Current file: <strong>{jobProgress.currentFile}</strong>
                        </Typography>
                      )}
                      
                      <Box sx={{ mt: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Progress: {jobProgress.progressPercent !== undefined ? jobProgress.progressPercent : Math.round((jobProgress.progress / (jobProgress.total || 1)) * 100)}%
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Job ID: {currentJobId?.substring(0, 20)}...
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={jobProgress.progressPercent !== undefined ? jobProgress.progressPercent : Math.round((jobProgress.progress / (jobProgress.total || 1)) * 100)}
                          sx={{ height: 8, borderRadius: 1 }}
                        />
                      </Box>
                      
                      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Alert severity="info" sx={{ flex: 1, py: 0.5 }}>
                          <Typography variant="caption">
                            {jobProgress.message || '✨ This process continues even if you refresh the page!'}
                          </Typography>
                        </Alert>
                        <Button 
                          size="small" 
                          color="error" 
                          variant="outlined" 
                          onClick={handleCancelJob}
                          sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                        >
                          Cancel / Reset
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Fade>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Action Panel */}
        <Grid item xs={12} lg={4}>
          <Card elevation={0}>
            <CardHeader
              title="Actions"
              subheader="Process selected files"
              avatar={
                <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                  <RocketLaunchIcon sx={{ fontSize: '1rem' }} />
                </Avatar>
              }
              titleTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
            />
            <CardContent>
              {/* Target Collection Selection */}
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel id="target-collection-label">Target MongoDB Collection</InputLabel>
                <Select
                  labelId="target-collection-label"
                  id="target-collection-select"
                  value={targetCollection}
                  label="Target MongoDB Collection"
                  onChange={(e) => setTargetCollection(e.target.value)}
                  disabled={processing}
                >
                  <MenuItem value="auto">
                    Auto-detect ({effectiveCollectionName})
                  </MenuItem>
                  <MenuItem value="testcases">
                    test_cases (Test Cases)
                  </MenuItem>
                  <MenuItem value="user-stories">
                    user_stories (User Stories)
                  </MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="contained"
                startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <RocketLaunchIcon />}
                onClick={handleCreateEmbeddings}
                disabled={selectedFiles.length === 0 || processing}
                size="large"
                fullWidth
                sx={{ mb: 2, py: 1.5, fontWeight: 700 }}
              >
                {processing ? 'Processing Embeddings...' : 'Create Embeddings'}
              </Button>

              {selectedFiles.length === 0 && !processing && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    👉 <strong>Step 1:</strong> Select a converted JSON file from the table on the left (Test Cases or User Stories).<br />
                    👉 <strong>Step 2:</strong> Click <strong>Create Embeddings</strong> to generate vectors and store into MongoDB Atlas.
                  </Typography>
                </Alert>
              )}

              {selectedFiles.length > 0 && !processing && (
                <Box sx={{ mb: 2, p: 2, borderRadius: '8px', bgcolor: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      READY TO EMBED
                    </Typography>
                    <Chip 
                      label={effectiveJobType === 'user-stories' ? 'User Stories' : 'Test Cases'} 
                      color={effectiveJobType === 'user-stories' ? 'secondary' : 'primary'} 
                      size="small" 
                    />
                  </Box>
                  <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                    MongoDB Collection: <code>{effectiveCollectionName}</code>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {selectedFiles.length} file(s) selected. Ready to store embeddings in MongoDB.
                  </Typography>
                </Box>
              )}

              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Vector Model:</strong> Mistral Embeddings (1024 dimensions)<br />
                  <strong>Database:</strong> Stored directly into MongoDB Atlas collections
                </Typography>
              </Alert>

              {selectedFiles.length > 0 && (
                <Card variant="outlined">
                  <CardContent sx={{ py: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Selected Files
                    </Typography>
                    <List dense>
                      {selectedFiles.slice(0, 3).map((file) => (
                        <ListItem key={file} sx={{ px: 0, py: 0.5 }}>
                          <ListItemText 
                            primary={file}
                            primaryTypographyProps={{ fontSize: '0.875rem' }}
                          />
                        </ListItem>
                      ))}
                      {selectedFiles.length > 3 && (
                        <ListItem sx={{ px: 0, py: 0.5 }}>
                          <ListItemText 
                            primary={`... and ${selectedFiles.length - 3} more`}
                            primaryTypographyProps={{ 
                              fontSize: '0.875rem',
                              fontStyle: 'italic',
                              color: 'text.secondary'
                            }}
                          />
                        </ListItem>
                      )}
                    </List>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Results Section */}
      {results.length > 0 && (
        <Fade in={true}>
          <Card elevation={0} sx={{ mt: 3 }}>
            <CardHeader
              title="Processing Results"
              subheader={`${results.filter(r => r.status === 'completed').length} completed, ${results.filter(r => r.status === 'failed').length} failed`}
              titleTypographyProps={{ fontWeight: 700 }}
            />
            <CardContent>
              <List>
                {results.map((result, index) => (
                  <ListItem key={index} sx={{ display: 'flex', alignItems: 'flex-start', border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}>
                    <Box sx={{ mr: 2, mt: 0.5 }}>
                      {getStatusIcon(result.status)}
                    </Box>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {result.file}
                          </Typography>
                          <Chip 
                            label={result.status} 
                            size="small" 
                            color={getStatusColor(result.status)}
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          {result.error ? (
                            <Alert severity="error" size="small" sx={{ mt: 1 }}>
                              {result.error}
                            </Alert>
                          ) : (
                            result.output && (
                              <Paper elevation={1} sx={{ p: 1, mt: 1, bgcolor: 'grey.50' }}>
                                <Typography variant="body2" component="pre" sx={{ 
                                  whiteSpace: 'pre-wrap', 
                                  fontSize: '0.75rem',
                                  fontFamily: 'monospace'
                                }}>
                                  {result.output.substring(0, 200)}
                                  {result.output.length > 200 && '...'}
                                </Typography>
                              </Paper>
                            )
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Fade>
      )}

      {/* Settings Dialog */}
      <Dialog open={showSettings} onClose={() => setShowSettings(false)} maxWidth="md" fullWidth>
        <DialogTitle>Embedding Configuration</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" paragraph>
            Current embedding configuration and settings:
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>Model Settings</Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText primary="Model" secondary="text-embedding-3-small" />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Dimensions" secondary="1536" />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="API Source" secondary="TestLeaf API" />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>Database Settings</Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText primary="Database" secondary="MongoDB Atlas" />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Collection" secondary="collection_test_cases" />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Vector Index" secondary="test_cases" />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSettings(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default EmbeddingsStore;