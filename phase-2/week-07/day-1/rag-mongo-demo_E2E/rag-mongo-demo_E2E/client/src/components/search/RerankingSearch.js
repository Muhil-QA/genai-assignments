import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  Alert,
  Collapse,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ArticleIcon from '@mui/icons-material/Article';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import InfoIcon from '@mui/icons-material/Info';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useSnackbar } from 'notistack';

const API_BASE = 'http://localhost:3001/api';

function RerankingSearch() {
  const [query, setQuery] = useState('Share Diagnostic Reports with Patients via WhatsApp');
  const [limit, setLimit] = useState(10);
  const [rerankTopK, setRerankTopK] = useState(50);
  const [rerankProvider, setRerankProvider] = useState('nvidia');
  const [rerankModel, setRerankModel] = useState('nvidia/nemotron-3.5-lightning-30b-a3b');
  const [customModelInput, setCustomModelInput] = useState('nvidia/nemotron-3.5-lightning-30b-a3b');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [beforeResults, setBeforeResults] = useState([]);
  const [afterResults, setAfterResults] = useState([]);
  const [searchInfo, setSearchInfo] = useState(null);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState({ modules: [], priorities: [], risks: [], types: [] });
  const [moduleFilter, setModuleFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [automationFilter, setAutomationFilter] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const { enqueueSnackbar } = useSnackbar();
  
  // Safe field getters across diverse schema conventions
  const getItemId = (item, fallback = '') =>
    item?.id || item?.testCaseId || item?.userStoryId || item?.storyId || item?.key || item?.tcId || (item?._id ? String(item._id) : fallback);

  const getItemTitle = (item, fallback = 'Untitled') =>
    item?.title || item?.testCaseTitle || item?.userStoryTitle || item?.name || item?.story_title || item?.storyTitle || item?.summary || fallback;

  const getItemDescription = (item, fallback = '') =>
    item?.description || item?.testCaseDescription || item?.userStoryDescription || item?.storyDescription || item?.acceptanceCriteria || fallback;

  const loadFilterOptions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/metadata/distinct`);
      const data = await response.json();
      
      if (data.success && data.metadata) {
        setFilterOptions(data.metadata);
      } else if (data.success && data.data) {
        setFilterOptions(data.data);
      } else {
        setFilterOptions({ modules: [], priorities: [], risks: [], types: [] });
      }
    } catch (err) {
      console.error('Failed to load filter options:', err);
      setFilterOptions({ modules: [], priorities: [], risks: [], types: [] });
    }
  }, []);

  const loadRerankConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/search/rerank-config`);
      const data = await response.json();
      if (data.success) {
        if (data.provider) setRerankProvider(data.provider);
        if (data.model) {
          setRerankModel(data.model);
          setCustomModelInput(data.model);
        }
      }
    } catch (err) {
      console.warn('Failed to load dynamic rerank config from server:', err);
    }
  }, []);

  React.useEffect(() => {
    loadFilterOptions();
    loadRerankConfig();
  }, [loadFilterOptions, loadRerankConfig]);

  const handleSearch = async () => {
    if (!query.trim()) {
      enqueueSnackbar('Please enter a search query', { variant: 'warning' });
      return;
    }

    setSearching(true);
    setError(null);
    setResults([]);
    setBeforeResults([]);
    setAfterResults([]);
    setSearchInfo(null);

    try {
      const filters = {};
      if (moduleFilter) filters.module = moduleFilter;
      if (priorityFilter) filters.priority = priorityFilter;
      if (riskFilter) filters.risk = riskFilter;
      if (automationFilter) filters.automationManual = automationFilter;

      const effectiveModel = customModelInput.trim() || rerankModel;

      const response = await fetch(`${API_BASE}/search/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
          rerankTopK,
          provider: rerankProvider,
          model: effectiveModel,
          filters
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      if (data.success) {
        const finalResults = data.afterResults || data.results || [];
        const initialBefore = data.beforeResults || data.candidates || (data.results ? [...data.results].sort((a, b) => (a.originalRank || 0) - (b.originalRank || 0)) : []);
        setResults(finalResults);
        setBeforeResults(initialBefore);
        setAfterResults(finalResults);
        setSearchInfo({
          count: data.count,
          totalCandidates: data.candidatesEvaluated || initialBefore.length || finalResults.length,
          searchTime: data.timing?.searchTime || 0,
          rerankingTime: data.timing?.rerankTime || data.timing?.groqTime || 0,
          totalTime: data.timing?.totalTime || 0,
          query: data.query,
          filters: data.filters,
          reranked: true,
          rerankModel: data.rerankModel || effectiveModel,
          rerankProvider: data.rerankProvider || rerankProvider,
          fallbackUsed: data.fallbackUsed,
          mode: 'semantic-rerank'
        });
        enqueueSnackbar(`Found ${data.count} results ranked by AI Reranker (${data.rerankModel || effectiveModel})`, { variant: 'success' });
      }
    } catch (err) {
      setError(err.message);
      enqueueSnackbar(err.message, { variant: 'error' });
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !searching) {
      handleSearch();
    }
  };

  const formatScore = (score) => {
    return score ? score.toFixed(4) : '0.0000';
  };

  const getScoreColor = (score) => {
    // Use normalized score thresholds (0-1 range)
    if (score >= 0.8) return 'success';
    if (score >= 0.6) return 'info';
    if (score >= 0.4) return 'warning';
    return 'error';
  };

  const getRankChangeIcon = (rankChange) => {
    if (rankChange > 0) return <TrendingUpIcon fontSize="small" color="success" />;
    if (rankChange < 0) return <TrendingDownIcon fontSize="small" color="error" />;
    return <SwapVertIcon fontSize="small" color="disabled" />;
  };

  const getRankChangeColor = (rankChange) => {
    if (rankChange > 0) return 'success';
    if (rankChange < 0) return 'error';
    return 'default';
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: 'auto', padding: 3 }}>
      <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: '9999px',
                bgcolor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'success.main',
              }}
            >
              <MergeTypeIcon sx={{ fontSize: '1.15rem' }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                AI Semantic Reranking & Score Fusion
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Retrieves candidates from MongoDB (BM25 + Vector) and reorders top results using LLM semantic evaluation.
              </Typography>
            </Box>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip 
              icon={<SmartToyIcon fontSize="small" />} 
              label={`Provider: ${rerankProvider.toUpperCase()}`} 
              size="small" 
              color="primary" 
              variant="outlined" 
            />
            <Chip 
              label={`Model: ${customModelInput || rerankModel}`} 
              size="small" 
              color="success" 
              variant="outlined" 
            />
            <Chip 
              label="⚡ Synced from .env" 
              size="small" 
              sx={{ bgcolor: 'rgba(16, 185, 129, 0.12)', color: 'success.dark', fontWeight: 600, fontSize: '0.72rem' }} 
            />
          </Box>
        </Box>

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth
              label="Search Query"
              variant="outlined"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., merge UHID, patient registration, login tests..."
              disabled={searching}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Rerank Model (Dynamic)"
              variant="outlined"
              value={customModelInput}
              onChange={(e) => setCustomModelInput(e.target.value)}
              disabled={searching}
              helperText="Dynamically read from .env; edit anytime"
            />
          </Grid>

          <Grid item xs={6} sm={3} md={1.5}>
            <TextField
              fullWidth
              label="Top-K Candidates"
              type="number"
              variant="outlined"
              value={rerankTopK}
              onChange={(e) => setRerankTopK(Math.max(10, Math.min(100, parseInt(e.target.value) || 50)))}
              disabled={searching}
              inputProps={{ min: 10, max: 100 }}
              helperText="Candidate pool"
            />
          </Grid>

          <Grid item xs={6} sm={3} md={1}>
            <TextField
              fullWidth
              label="Final Limit"
              type="number"
              variant="outlined"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
              disabled={searching}
              inputProps={{ min: 1, max: 50 }}
              helperText="Top results"
            />
          </Grid>

          <Grid item xs={12} md={1.5}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              startIcon={searching ? <CircularProgress size={20} /> : <SearchIcon />}
              sx={{ height: '56px', fontWeight: 700 }}
            >
              {searching ? 'Scoring...' : 'Search'}
            </Button>
          </Grid>
        </Grid>

        {/* Filters */}
        <Box sx={{ mt: 2 }}>
          <Button
            startIcon={<FilterListIcon />}
            endIcon={showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setShowFilters(!showFilters)}
            size="small"
          >
            Filters
          </Button>

          <Collapse in={showFilters}>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Module</InputLabel>
                  <Select
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                    label="Module"
                    sx={{ bgcolor: 'background.paper' , minWidth: '200px',width: '100%'}}
                  >
                    <MenuItem value="">All Modules</MenuItem>
                    {filterOptions.modules.map((module) => (
                      <MenuItem key={module} value={module}>{module}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Priority</InputLabel>
                  <Select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    label="Priority"
                    sx={{ bgcolor: 'background.paper' , minWidth: '200px',width: '100%'}}
                  >
                    <MenuItem value="">All Priorities</MenuItem>
                    {filterOptions.priorities.map((priority) => (
                      <MenuItem key={priority} value={priority}>{priority}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Risk</InputLabel>
                  <Select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                    label="Risk"
                    sx={{ bgcolor: 'background.paper' , minWidth: '200px',width: '100%'}}
                  >
                    <MenuItem value="">All Risk Levels</MenuItem>
                    {filterOptions.risks.map((risk) => (
                      <MenuItem key={risk} value={risk}>{risk}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={automationFilter}
                    onChange={(e) => setAutomationFilter(e.target.value)}
                    label="Type"
                    sx={{ bgcolor: 'background.paper' , minWidth: '200px',width: '100%'}}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {filterOptions.types.map((type) => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Collapse>
        </Box>
      </Paper>

      {/* Search Info */}
      {searchInfo && (
        <Alert 
          severity="success"
          icon={<MergeTypeIcon />}
          sx={{ mb: 3 }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle2" fontWeight={700}>
                AI Semantic Reranking Results:
              </Typography>
              <Typography variant="body2">
                Found {searchInfo.count} test cases evaluated from {searchInfo.totalCandidates || searchInfo.count} candidates
              </Typography>
              {searchInfo.rerankModel && (
                <Chip
                  size="small"
                  color="primary"
                  label={`Model: ${searchInfo.rerankProvider ? searchInfo.rerankProvider.toUpperCase() + ' - ' : ''}${searchInfo.rerankModel}`}
                />
              )}
              {searchInfo.fallbackUsed && (
                <Chip size="small" color="warning" label="Fallback Activated" />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              <strong>Timing:</strong> Total: {searchInfo.totalTime}ms | <strong>LLM Reranking Time:</strong> {searchInfo.rerankingTime}ms | <strong>Method:</strong> Hybrid Retrieval → Semantic LLM Scoring
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Results with Before/After Tabs */}
      {results.length > 0 && (
        <Box>
          <Paper elevation={2} sx={{ mb: 3 }}>
            <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
              <Tab label={`After AI Reranking (Top ${afterResults.length})`} />
              <Tab label={`Before Reranking (${beforeResults.length} Candidates from RAG)`} />
              <Tab label={`Comparison Table (Top ${afterResults.length} vs ${beforeResults.length} Candidates)`} />
            </Tabs>
          </Paper>

          {/* Tab 0: After Reranking */}
          {tabValue === 0 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <ArticleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                After AI Reranking ({afterResults.length} results)
              </Typography>
              {afterResults.map((result, index) => (
                <Card key={result._id || index} sx={{ mb: 2 }} elevation={2}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Chip 
                            label={`#${result.newRank || index + 1}`} 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                          />
                          <Typography variant="h6" component="div">
                            {getItemId(result, `Result ${index + 1}`)}
                          </Typography>
                          <Chip 
                            label={`Rerank Score: ${formatScore(result.rerankScore || result.fusedScore)}`} 
                            color="success"
                            size="small"
                          />
                          {result.originalRank && (
                            <Chip 
                              label={`Was #${result.originalRank} in RAG Candidates`} 
                              size="small" 
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                          )}
                        </Box>

                        <Typography variant="h6" color="text.primary" sx={{ mb: 1 }}>
                          {getItemTitle(result)}
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                          {result.module && (
                            <Chip label={`Module: ${result.module}`} size="small" variant="outlined" />
                          )}
                          {result.priority && (
                            <Chip 
                              label={result.priority} 
                              size="small" 
                              color={result.priority === 'P1' ? 'error' : result.priority === 'P2' ? 'warning' : 'default'}
                            />
                          )}
                          {result.risk && (
                            <Chip 
                              label={`Risk: ${result.risk}`} 
                              size="small" 
                              color={result.risk === 'High' ? 'error' : result.risk === 'Medium' ? 'warning' : 'success'}
                              variant="outlined"
                            />
                          )}
                        </Box>

                        {getItemDescription(result) && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            <strong>Description:</strong> {getItemDescription(result)}
                          </Typography>
                        )}

                        <Divider sx={{ my: 1 }} />

                        {/* Score Breakdown */}
                        <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                            <strong>Ranking Scores:</strong>
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            {result.vectorScore !== undefined && (
                              <Typography variant="caption" color="text.secondary">
                                🧠 Vector Score: {formatScore(result.vectorScore)}
                              </Typography>
                            )}
                            {result.bm25Score !== undefined && (
                              <Typography variant="caption" color="text.secondary">
                                🔤 BM25 Score: {formatScore(result.bm25Score)}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              ⭐ AI Rerank: {formatScore(result.rerankScore || 0.5)}
                            </Typography>
                          </Box>
                        </Paper>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* Tab 1: Before Reranking */}
          {tabValue === 1 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <ArticleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Initial Candidates (Before AI Reranking - All {beforeResults.length} candidates from RAG)
              </Typography>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  Showing all {beforeResults.length} candidates retrieved from RAG via hybrid search (BM25 + Vector). Notice their original ranks #1 through #{beforeResults.length}!
                </Typography>
              </Alert>

              {beforeResults.map((result, index) => (
                <Card key={result._id || index} sx={{ mb: 2 }} elevation={2}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Chip 
                            label={`Candidate #${result.originalRank || index + 1} of ${beforeResults.length}`} 
                            size="small" 
                            color="default" 
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                          <Typography variant="h6" component="div">
                            {getItemId(result, `Candidate ${index + 1}`)}
                          </Typography>
                          <Chip 
                            label={`Vector: ${formatScore(result.vectorScore || 0)}`} 
                            color={getScoreColor(result.vectorScore || 0)}
                            size="small" 
                          />
                          {result.bm25Score !== undefined && (
                            <Chip 
                              label={`BM25: ${formatScore(result.bm25Score || 0)}`} 
                              size="small" 
                              variant="outlined"
                            />
                          )}
                          <Chip 
                            label={`Hybrid Fused: ${formatScore(result.fusedScore || result.score || 0)}`} 
                            size="small" 
                            color="info"
                          />
                        </Box>

                        <Typography variant="h6" color="text.primary" sx={{ mb: 1 }}>
                          {getItemTitle(result)}
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                          {result.module && (
                            <Chip label={`Module: ${result.module}`} size="small" variant="outlined" />
                          )}
                          {result.priority && (
                            <Chip 
                              label={result.priority} 
                              size="small" 
                              color={result.priority === 'P1' ? 'error' : result.priority === 'P2' ? 'warning' : 'default'}
                            />
                          )}
                        </Box>

                        {getItemDescription(result) && (
                          <Typography variant="body2" color="text.secondary">
                            <strong>Description:</strong> {getItemDescription(result)}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* Tab 2: Comparison Table */}
          {tabValue === 2 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <CompareArrowsIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Before vs After Comparison (Top {afterResults.length} vs {beforeResults.length} Candidates)
              </Typography>

              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Original Rank (Candidates)</strong></TableCell>
                      <TableCell><strong>Test Case ID</strong></TableCell>
                      <TableCell><strong>Title</strong></TableCell>
                      <TableCell><strong>Original RAG Score</strong></TableCell>
                      <TableCell><strong>Vector Score</strong></TableCell>
                      <TableCell><strong>{searchInfo?.rerankProvider ? `${searchInfo.rerankProvider.toUpperCase()} Rerank Score` : 'AI Rerank Score'}</strong></TableCell>
                      <TableCell><strong>Final Rank</strong></TableCell>
                      <TableCell><strong>Rank Movement</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {afterResults.map((result, newRankIndex) => {
                      const newRank = newRankIndex + 1;
                      const originalRank = result.originalRank || (newRankIndex + 1);
                      const rankChange = typeof originalRank === 'number' ? originalRank - newRank : 0;
                      
                      return (
                        <TableRow 
                          key={result._id || newRankIndex}
                          sx={{ 
                            backgroundColor: newRankIndex < 3 ? 'action.hover' : 'inherit'
                          }}
                        >
                          <TableCell>
                            <Chip 
                              label={`#${originalRank} / ${beforeResults.length || 50}`} 
                              size="small" 
                              variant="outlined" 
                              sx={{ fontWeight: 700, minWidth: 42 }} 
                            />
                          </TableCell>
                          <TableCell>{getItemId(result, `TC-${newRankIndex + 1}`)}</TableCell>
                          <TableCell sx={{ maxWidth: 260 }}>
                            {getItemTitle(result).substring(0, 50)}{getItemTitle(result).length > 50 ? '...' : ''}
                          </TableCell>
                          <TableCell>{formatScore(result.fusedScore || result.score || 0)}</TableCell>
                          <TableCell>{formatScore(result.vectorScore || 0)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={formatScore(result.rerankScore || 0.5)} 
                              size="small" 
                              color="success" 
                              sx={{ fontWeight: 700 }}
                            />
                          </TableCell>
                          <TableCell>
                            <strong>#{newRank}</strong>
                          </TableCell>
                          <TableCell>
                            {rankChange > 0 ? (
                              <Chip
                                size="small"
                                icon={<TrendingUpIcon fontSize="small" />}
                                label={`+${rankChange}`}
                                color="success"
                                sx={{ fontWeight: 700 }}
                              />
                            ) : rankChange < 0 ? (
                              <Chip
                                size="small"
                                icon={<TrendingDownIcon fontSize="small" />}
                                label={`${rankChange}`}
                                color="error"
                                sx={{ fontWeight: 700 }}
                              />
                            ) : (
                              <Chip
                                size="small"
                                icon={<SwapVertIcon fontSize="small" />}
                                label="0"
                                variant="outlined"
                                sx={{ fontWeight: 600 }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <Alert severity="info" icon={<InfoIcon />} sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>How to read this comparison table:</strong><br />
                  • <strong>Original Rank (Candidates):</strong> Position in the {searchInfo?.totalCandidates || beforeResults.length || 50}-candidate pool retrieved from RAG via hybrid search.<br />
                  • <strong>Original RAG Score:</strong> Fused hybrid score combining vector and keyword retrieval.<br />
                  • <strong>Vector Score:</strong> Semantic embedding similarity score (0.0000 - 1.0000).<br />
                  • <strong>{searchInfo?.rerankProvider ? `${searchInfo.rerankProvider.toUpperCase()} Rerank Score` : 'AI Rerank Score'}:</strong> Relevance score computed by the AI reranker ({searchInfo?.rerankModel || customModelInput || 'Semantic LLM'}).<br />
                  • <strong>Final Rank:</strong> Top-{afterResults.length} reordered position after AI reranking.<br />
                  • <strong>Rank Movement:</strong> 🟩 <span style={{ color: '#16a34a', fontWeight: 'bold' }}>+X</span> indicates the item jumped up X positions from deeper in the candidate pool. 🟥 <span style={{ color: '#dc2626', fontWeight: 'bold' }}>-Y</span> indicates it moved down.
                </Typography>
              </Alert>
            </Box>
          )}
        </Box>
      )}

      {/* No Results Message */}
      {!searching && results.length === 0 && searchInfo && (
        <Alert severity="info">
          No test cases found matching your search query. Try adjusting your search terms or filters.
        </Alert>
      )}
    </Box>
  );
}

export default RerankingSearch;
