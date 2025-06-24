import React, { useState, useRef, useEffect } from 'react';

interface Option {
  id: string;
  name: string;
  expirationDate?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "選択または検索してください",
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Update display value when value prop changes (but not when user is typing)
  useEffect(() => {
    if (!isTyping) {
      const selectedOption = options.find(option => option.id === value);
      setDisplayValue(selectedOption ? selectedOption.name : value);
      setSearchTerm(selectedOption ? selectedOption.name : value);
    }
  }, [value, options, isTyping]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsTyping(false);
        // If no option was selected, revert to original value
        if (isTyping) {
          const selectedOption = options.find(option => option.id === value);
          setDisplayValue(selectedOption ? selectedOption.name : value);
          setSearchTerm(selectedOption ? selectedOption.name : value);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTyping, value, options]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setSearchTerm(inputValue);
    setDisplayValue(inputValue);
    setIsOpen(true);
    setIsTyping(true);
    
    // For custom text input, we'll pass the text as-is
    // This allows for manual entry when no matching option exists
    onChange(inputValue);
  };

  const handleOptionSelect = (option: Option) => {
    onChange(option.id);
    setDisplayValue(option.name);
    setSearchTerm(option.name);
    setIsOpen(false);
    setIsTyping(false);
    inputRef.current?.blur();
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    setIsTyping(true);
  };

  const handleInputBlur = () => {
    // Delay to allow option selection
    setTimeout(() => {
      setIsTyping(false);
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setIsTyping(false);
      inputRef.current?.blur();
    } else if (e.key === 'Enter') {
      setIsOpen(false);
      setIsTyping(false);
      inputRef.current?.blur();
    }
  };

  const isExpirationSoon = (expirationDate: string): boolean => {
    const expDate = new Date(expirationDate);
    const currentDate = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(currentDate.getMonth() + 3);
    
    return expDate <= threeMonthsFromNow;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        autoComplete="off"
      />
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option.id}
                className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                onClick={() => handleOptionSelect(option)}
              >
                <div className="flex justify-between items-center">
                  <span className="text-gray-800">{option.name}</span>
                  {option.expirationDate && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      isExpirationSoon(option.expirationDate)
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {new Date(option.expirationDate).toLocaleDateString('ja-JP')}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">
              該当する結果がありません
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchableSelect; 