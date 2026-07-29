import { useState, useEffect, useMemo } from 'react';

/**
 * Custom Hook: useFilteredPaginatedData
 * 
 * Unifies filtering, searching, and pagination logic across all dispensing pages.
 * Eliminates ~40 lines of duplicated code per page.
 * 
 * @param {Array} data - Raw data array
 * @param {Object} options
 * @param {Function} options.filterFn - (item, filters) => boolean
 * @param {Function} options.searchFn - (item, searchTerm) => boolean
 * @param {number} options.defaultRowsPerPage - default 50
 * @returns {Object} - All state and derived values needed for filtered, paginated display
 */
const useFilteredPaginatedData = (data = [], options = {}) => {
  const {
    filterFn,
    searchFn,
    defaultRowsPerPage = 50,
  } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});

  // Reset page when filters or search change
  useEffect(() => {
    const t = setTimeout(() => setCurrentPage(1), 0);
    return () => clearTimeout(t);
  }, [searchTerm, filters]);

  // Filtered data
  const filtered = useMemo(() => {
    return data.filter(item => {
      // Apply search
      if (searchTerm && searchFn && !searchFn(item, searchTerm.toLowerCase())) {
        return false;
      }
      // Apply filters
      if (filterFn && !filterFn(item, filters)) {
        return false;
      }
      return true;
    });
  }, [data, searchTerm, filters, filterFn, searchFn]);

  // Paginated data
  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filtered.slice(startIndex, startIndex + rowsPerPage);
  }, [filtered, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filtered.length / rowsPerPage);

  // Ensure current page is valid
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      const t = setTimeout(() => setCurrentPage(totalPages), 0);
      return () => clearTimeout(t);
    }
  }, [totalPages, currentPage]);

  // Set a single filter key
  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Clear all filters and search
  const clearAll = () => {
    setSearchTerm('');
    setFilters({});
    setCurrentPage(1);
  };

  return {
    // Data
    filtered,
    paginated,
    totalFiltered: filtered.length,
    totalAll: data.length,

    // Pagination
    currentPage,
    totalPages,
    rowsPerPage,
    setCurrentPage,
    setRowsPerPage,

    // Search
    searchTerm,
    setSearchTerm,

    // Filters
    filters,
    setFilter,
    setFilters,
    clearAll,
  };
};

export default useFilteredPaginatedData;
