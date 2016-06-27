'use strict';

import { addItem, removeItem, selectItem, addChoice, filterChoices, activateChoices, addGroup, clearAll } from './actions/index';
import { isScrolledIntoView, getAdjacentEl, findAncestor, wrap, isType, strToEl, extend, getWidthOfInput, debounce } from './lib/utils.js';
import Fuse from 'fuse.js';
import Store from './store/index.js';

/**
 * Choices
 *
 * To do:
 *    - Pagination
 *    - Single select box search in dropdown
 */
export class Choices {
    constructor(element = '[data-choice]', userOptions = {}) {

        // If there are multiple elements, create a new instance 
        // for each element besides the first one (as that already has an instance)
        if(isType('String', element)) {
            const elements = document.querySelectorAll(element);
            if(elements.length > 1) {
                for (let i = 1; i < elements.length; i++) {
                    const el = elements[i];
                    new Choices(el, userOptions);
                }
            }
        }

        const defaultOptions = {
            items: [],
            maxItemCount: -1,
            addItems: true,
            removeItems: true,
            removeItemButton: false,
            editItems: false,
            duplicateItems: true,
            delimiter: ',',
            paste: true,
            searchOptions: true, 
            regexFilter: null,
            placeholder: true,
            placeholderValue: null,
            prependValue: null,
            appendValue: null,
            loadingText: 'Loading...',
            templates: {},
            classNames: {
                containerOuter: 'choices',
                containerInner: 'choices__inner',
                input: 'choices__input',
                inputCloned: 'choices__input--cloned',
                list: 'choices__list',
                listItems: 'choices__list--multiple',
                listSingle: 'choices__list--single',
                listDropdown: 'choices__list--dropdown',
                item: 'choices__item',
                itemSelectable: 'choices__item--selectable',
                itemDisabled: 'choices__item--disabled',
                itemChoice: 'choices__item--choice',
                group: 'choices__group',
                groupHeading : 'choices__heading',
                button: 'choices__button',
                activeState: 'is-active',
                focusState: 'is-focused',
                openState: 'is-open',
                disabledState: 'is-disabled',
                highlightedState: 'is-highlighted',
                hiddenState: 'is-hidden',
                flippedState: 'is-flipped',
                selectedState: 'is-selected',
            },
            callbackOnInit: () => {},
            callbackOnAddItem: (id, value, passedInput) => {},
            callbackOnRemoveItem: (id, value, passedInput) => {},
        };

        // Merge options with user options
        this.options = extend(defaultOptions, userOptions);

        // Create data store
        this.store = new Store(this.render);

        // State tracking
        this.initialised  = false;
        this.currentState = {};
        this.prevState    = {};
        this.currentValue = '';

        // Retrieve triggering element (i.e. element with 'data-choice' trigger)
        this.passedElement = isType('String', element) ? document.querySelector(element) : element;

        this.highlightPosition = 0;
        this.canSearch = this.options.searchOptions;

        // Assign preset items from passed object first
        this.presetItems = this.options.items;
        // Then add any values passed from attribute
        if(this.passedElement.value !== '') {
            this.presetItems = this.presetItems.concat(this.passedElement.value.split(this.options.delimiter));
        }

        // Bind methods
        this.init    = this.init.bind(this);
        this.render  = this.render.bind(this);
        this.destroy = this.destroy.bind(this);
        this.disable = this.disable.bind(this);
        
        // Bind event handlers
        this._onFocus     = this._onFocus.bind(this);
        this._onBlur      = this._onBlur.bind(this);
        this._onKeyUp     = this._onKeyUp.bind(this);
        this._onKeyDown   = this._onKeyDown.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseOver = this._onMouseOver.bind(this);
        this._onPaste     = this._onPaste.bind(this);
        this._onInput     = this._onInput.bind(this);

        // Cutting the mustard
        const cuttingTheMustard = 'querySelector' in document && 'addEventListener' in document && 'classList' in document.createElement("div");
        if (!cuttingTheMustard) console.error('Choices: Your browser doesn\'t support Choices');

        // Input type check
        const canInit = this.passedElement && ['select-one', 'select-multiple', 'text'].includes(this.passedElement.type);

        if(canInit) {
            // Let's have it large
            this.init();            
        } else {
            console.error('Choices: Incompatible input passed');
        }
    }

    /**
     * Initialise Choices
     * @return
     * @public
     */
    init(callback) {
        if(this.initialised !== true) {

            this.initialised = true;

            // Create required elements
            this._createTemplates();

            // Generate input markup
            this._createInput();

            this.store.subscribe(this.render);

            // Render any items
            this.render();

            // Trigger event listeners 
            this._addEventListeners();

            // Run callback if it is a function
            if(callback = this.options.callbackOnInit){
                if(isType('Function', callback)) {
                    callback();
                } else {
                    console.error('callbackOnInit: Callback is not a function');
                }
            }
        }
    }
    
    /**
     * Destroy Choices and nullify values
     * @return
     * @public
     */
    destroy() {
        this.passedElement.classList.remove(this.options.classNames.input, this.options.classNames.hiddenState);
        this.passedElement.tabIndex = '';
        this.passedElement.removeAttribute('style', 'display:none;');
        this.passedElement.removeAttribute('aria-hidden');
                
        this.containerOuter.outerHTML = this.passedElement.outerHTML;

        this.passedElement = null;
        this.userOptions   = null;
        this.options       = null;
        this.store         = null;

        this._removeEventListeners();
    }

    /**
     * Select item (a selected item can be deleted)
     * @param  {Element} item Element to select
     * @return {Object} Class instance
     * @public
     */
    selectItem(item) {
        if(!item) return;
        const id = item.id;
        this.store.dispatch(selectItem(id, true));

        return this;
    }

    /** 
     * Deselect item
     * @param  {Element} item Element to de-select
     * @return {Object} Class instance
     * @public
     */
    deselectItem(item) {
        if(!item) return;
        const id = item.id;
        this.store.dispatch(selectItem(id, false));

        return this;
    }

    /**
     * Highlight items within store
     * @return {Object} Class instance
     * @public
     */
    highlightAll() {
        const items = this.store.getItems();
        items.forEach((item) => {
            this.selectItem(item);
        });

        return this;
    }

    /**
     * Deselect items within store
     * @return {Object} Class instance
     * @public
     */
    deselectAll() {
        const items = this.store.getItems();
        items.forEach((item) => {
            this.deselectItem(item);
        });

        return this;
    }

    /**
     * Remove an item from the store by its value
     * @param  {String} value Value to search for
     * @return {Object} Class instance
     * @public
     */
    removeItemsByValue(value) {
        if(!value || !isType('String', value)) console.error('removeItemsByValue: No value was passed to be removed'); return;

        const items = this.store.getItemsFilteredByActive();

        items.forEach((item) => {
            if(item.value === value) {
                this._removeItem(item);
            }
        });

        return this;
    }

    /**
     * Remove all items from store array
     * Note: removed items are soft deleted
     * @param  {Number} excludedId Optionally exclude item by ID
     * @return {Object} Class instance
     * @public
     */
    removeActiveItems(excludedId) {
        const items = this.store.getItemsFilteredByActive();

        items.forEach((item) => {
            if(item.active && excludedId !== item.id) {
                this._removeItem(item);   
            } 
        });

        return this;
    }

    /** 
     * Remove all selected items from store
     * Note: removed items are soft deleted
     * @return {Object} Class instance
     * @public
     */
    removeSelectedItems() {
        const items = this.store.getItemsFilteredByActive();

        items.forEach((item) => {
            if(item.selected && item.active) {
                this._removeItem(item);
            }
        });

        return this;
    }

    /** 
     * Show dropdown to user by adding active state class
     * @return {Object} Class instance
     * @public
     */
    showDropdown() { 
        this.containerOuter.classList.add(this.options.classNames.openState);
        this.dropdown.classList.add(this.options.classNames.activeState);

        const dimensions = this.dropdown.getBoundingClientRect();
        const shouldFlip = dimensions.top + dimensions.height >= document.body.offsetHeight;

        // Whether or not the dropdown should appear above or below input
        if(shouldFlip) {
            this.containerOuter.classList.add(this.options.classNames.flippedState);
        } else {
            this.containerOuter.classList.remove(this.options.classNames.flippedState);
        }

        return this;
    }

    /** 
     * Hide dropdown from user
     * @return {Object} Class instance
     * @public
     */
    hideDropdown() {
        // A dropdown flips if it does not have space below the input
        const isFlipped = this.containerOuter.classList.contains(this.options.classNames.flippedState);

        this.containerOuter.classList.remove(this.options.classNames.openState);
        this.dropdown.classList.remove(this.options.classNames.activeState);

        if(isFlipped) {
            this.containerOuter.classList.remove(this.options.classNames.flippedState);
        }

        return this;
    }

    /** 
     * Determine whether to hide or show dropdown based on its current state
     * @return {Object} Class instance
     * @public
     */
    toggleDropdown() {
        const isActive = this.dropdown.classList.contains(this.options.classNames.activeState);

        isActive ? this.hideDropdown() : this.showDropdown();

        return this;
    }

    /**
     * Set value of input 
     * @param {Array} args Array of value objects or value strings
     * @return {Object} Class instance
     * @public
     */
    setValue(args) {
        // Convert args to an itterable array
        const values = [...args];

        values.forEach((item, index) => {
            if(isType('Object', item)) {
                if(!item.value) return;
                // If we are dealing with a select input, we need to create an option first 
                // that is then selected. For text inputs we can just add items normally.
                if(this.passedElement.type !== 'text') {
                    this._addChoice(true, false, item.value, item.label, -1);
                } else {
                    this._addItem(item.value, item.label, item.id);    
                }
            } else if(isType('String', item)) {
                if(this.passedElement.type !== 'text') {
                    this._addChoice(true, false, item, item, -1);
                } else {
                    this._addItem(item);
                }
            }
        });

        return this;
    }

    /**
     * Clear value of inputs
     * @return {Object} Class instance
     * @public
     */
    clearValue() {
        this.store.dispatch(clearAll());
        return this;
    }

    /**
     * Disable 
     * @return {Object} Class instance
     * @public
     */
    disable() {
        this.passedElement.disabled = true;
        if(this.initialised) {
            this.input.disabled = true;
            this.containerOuter.classList.add(this.options.classNames.disabledState);
        }
        return this;
    }

    /** 
     * Populate options via ajax callback
     * @param  {Function} fn Passed 
     * @return {Object} Class instance
     * @public
     */
    ajax(fn) {
        this.containerOuter.classList.add('is-loading');
        // this.input.placeholder = this.options.loadingText;

        const placeholderItem = this._getTemplate('item', { id: -1, value: 'Loading', label: this.options.loadingText, active: true});
        this.itemList.appendChild(placeholderItem);

        const callback = (results, value, label) => {
            if(results && results.length) {
                this.containerOuter.classList.remove('is-loading');
                this.input.placeholder = "";
                results.forEach((result, index) => {
                    // Add each result to option dropdown
                    if(index === 0) { 
                       this._addItem(result[value], result[label], index);
                    }
                    this._addChoice(false, false, result[value], result[label]);
                });
            }
        };

        fn(callback);
        return this;
    }

    /** 
     * Set value of input to blank
     * @return {Object} Class instance
     * @public
     */
    clearInput() {
        if (this.input.value) this.input.value = '';
        if(this.passedElement.type !== 'select-one') {
            this.input.style.width = getWidthOfInput(this.input);
        }

        return this;
    }

    /** 
     * Process enter key event
     * @param  {Array} activeItems Items that are currently active
     * @return
     * @private
     */
    _handleEnter(activeItems, value) {
        let canUpdate = true;

        if(this.options.addItems) {
            if (this.options.maxItemCount && this.options.maxItemCount > 0 && this.options.maxItemCount <= this.itemList.children.length) {
                // If there is a max entry limit and we have reached that limit
                // don't update
                canUpdate = false;
            } else if(this.options.duplicateItems === false && this.passedElement.value) {
                // If no duplicates are allowed, and the value already exists
                // in the array, don't update
                canUpdate = !activeItems.some((item) => item.value === value );
            }   
        } else {
            canUpdate = false;
        }

        if (canUpdate) {
            let canAddItem = true;

            // If a user has supplied a regular expression filter
            if(this.options.regexFilter) {
                // Determine whether we can update based on whether 
                // our regular expression passes 
                canAddItem = this._regexFilter(value);
            }
            
            // All is good, add
            if(canAddItem) {
                this.toggleDropdown();
                this._addItem(value);
                this.clearInput(this.passedElement);
            }
        }
    };

    /**
     * Process back space event
     * @param  {Array} Active items
     * @return
     * @private
     */
    _handleBackspace(activeItems) {
        if(this.options.removeItems && activeItems) {
            const lastItem = activeItems[activeItems.length - 1];
            const hasSelectedItems = activeItems.some((item) => item.selected === true);

            // If editing the last item is allowed and there are not other selected items, 
            // we can edit the item value. Otherwise if we can remove items, remove all selected items
            if(this.options.editItems && !hasSelectedItems && lastItem) {
                this.input.value = lastItem.value;
                this._removeItem(lastItem);
            } else {
                if(!hasSelectedItems) { this.selectItem(lastItem); }
                this.removeSelectedItems();    
            }
        }
    };

    /**
     * Key down event
     * @param  {Object} e Event
     * @return
     */
    _onKeyDown(e) {
        if(e.target !== this.input) return;

        const ctrlDownKey = e.ctrlKey || e.metaKey;
        const backKey     = 46;
        const deleteKey   = 8;
        const enterKey    = 13;
        const aKey        = 65;
        const escapeKey   = 27;
        const upKey       = 38;
        const downKey     = 40;

        const activeItems       = this.store.getItemsFilteredByActive();
        const activeChoices     = this.store.getChoicesFilteredByActive();
        
        const hasFocusedInput   = this.input === document.activeElement;
        const hasActiveDropdown = this.dropdown.classList.contains(this.options.classNames.activeState);
        const hasItems          = this.itemList && this.itemList.children;
        const keyString         = String.fromCharCode(event.keyCode);

        // If a user is typing and the dropdown is not active
        if(this.passedElement.type !== 'text' && /[a-zA-Z0-9-_ ]/.test(keyString) && !hasActiveDropdown) {
            this.showDropdown();
        }

        this.canSearch = this.options.searchOptions;

        switch (e.keyCode) {
            case aKey:
                // If CTRL + A or CMD + A have been pressed and there are items to select
                if(ctrlDownKey && hasItems) {
                    this.canSearch = false;
                    if(this.options.removeItems && !this.input.value && this.input === document.activeElement) {
                        // Highlight items
                        this.highlightAll(this.itemList.children);
                    }
                }
                break;

            case enterKey:
                // If enter key is pressed and the input has a value
                if(e.target.value && this.passedElement.type === 'text') {
                    const value = this.input.value;
                    this._handleEnter(activeItems, value);                    
                }

                if(hasActiveDropdown) {
                    const highlighted = this.dropdown.querySelector(`.${this.options.classNames.highlightedState}`);
                
                    if(highlighted) {
                        const value = highlighted.getAttribute('data-value');
                        const label = highlighted.innerHTML;
                        const id    = highlighted.getAttribute('data-id');
                        this._addItem(value, label, id);
                        this.clearInput(this.passedElement);

                        if(this.passedElement.type === 'select-one') {
                            this.isSearching = false;
                            this.store.dispatch(activateChoices());
                            this.toggleDropdown();
                        }
                    }
                }
                break;

            case escapeKey:
                if(hasActiveDropdown) {
                    this.toggleDropdown();
                }
                break;

            case downKey:
            case upKey:
                // If up or down key is pressed, traverse through options
                if(hasActiveDropdown) {
                    const currentEl    = this.dropdown.querySelector(`.${this.options.classNames.highlightedState}`);
                    const directionInt = e.keyCode === downKey ? 1 : -1;
                    let nextEl;

                    this.canSearch = false;

                    if(currentEl) {
                        nextEl = getAdjacentEl(currentEl, '[data-option-selectable]', directionInt);
                    } else {
                        nextEl = this.dropdown.querySelector('[data-option-selectable]');
                    }
                
                    if(nextEl) {
                        // We prevent default to stop the cursor moving 
                        // when pressing the arrow
                        if(!isScrolledIntoView(nextEl, this.choiceList, directionInt)) {
                            this._scrollToChoice(nextEl, directionInt);
                        }
                        this._highlightChoice(nextEl);
                    }

                    // Prevent default to maintain cursor position whilst
                    // traversing dropdown options
                    e.preventDefault();
                }
                break

            case backKey:
            case deleteKey:
                // If backspace or delete key is pressed and the input has no value
                if(hasFocusedInput && !e.target.value && this.passedElement.type !== 'select-one') {
                    this._handleBackspace(activeItems);
                    e.preventDefault();
                }
                break;

            default:
                break;
        }
    }

    /**
     * Key up event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onKeyUp(e) {
        if(e.target !== this.input) return;
        const keyString = String.fromCharCode(event.keyCode);

        // We are typing into a text input and have a value, we want to show a dropdown
        // notice. Otherwise hide the dropdown
        if(this.passedElement.type === 'text') {
            const hasActiveDropdown = this.dropdown.classList.contains(this.options.classNames.activeState);
            let dropdownItem;
            if(this.input.value) {
                const activeItems = this.store.getItemsFilteredByActive();
                const isUnique = !activeItems.some((item) => item.value === this.input.value);

                if (this.options.maxItemCount && this.options.maxItemCount > 0 && this.options.maxItemCount <= this.itemList.children.length) {
                    dropdownItem = this._getTemplate('notice', `Only ${ this.options.maxItemCount } options can be added.`);
                } else if(!this.options.duplicateItems && !isUnique) {
                    dropdownItem = this._getTemplate('notice', `Only unique values can be added.`);
                } else {
                    dropdownItem = this._getTemplate('notice', `Add "${ this.input.value }"`);
                }
                
                if((this.options.regexFilter && this._regexFilter(this.input.value)) || !this.options.regexFilter) {
                    this.dropdown.innerHTML = dropdownItem.outerHTML;
                    if(!this.dropdown.classList.contains(this.options.classNames.activeState)) {
                        this.showDropdown();    
                    }
                }

            } else {
                if(hasActiveDropdown) this.hideDropdown();
            }
        }

        // If we have enabled text search
        if(this.canSearch) {
            if(this.input === document.activeElement) {
                const options            = this.store.getChoices();
                const hasUnactiveChoices = options.some((option) => option.active !== true);

                // Check that we have a value to search and the input was an alphanumeric character
                if(this.input.value && options.length && /[a-zA-Z0-9-_ ]/.test(keyString)) {
                    const handleFilter = () => {
                        const newValue = this.input.value.trim();
                        const currentValue = this.currentValue.trim();

                        if(newValue.length >= 1 && newValue !== currentValue + ' ') {
                            const haystack = this.store.getChoicesFiltedBySelectable();
                            const needle   = newValue;
                            const fuse = new Fuse(haystack, { 
                                keys: ['label', 'value'],
                                shouldSort: true,
                                include: 'score',
                            });
                            const results = fuse.search(needle);

                            this.currentValue = newValue;
                            this.highlightPosition = 0;
                            this.isSearching = true;
                            this.store.dispatch(filterChoices(results));
                        }
                    };

                    handleFilter();
                } else if(hasUnactiveChoices) {
                    // Otherwise reset options to active
                    this.isSearching = false;
                    this.store.dispatch(activateChoices());
                }
            }
        } 
    }

    /**
     * Input event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onInput(e) {
        if(this.passedElement.type !== 'select-one') {
            this.input.style.width = getWidthOfInput(this.input);    
        }
    }

    /**
     * Click event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onMouseDown(e) {
        // If not a right click
        if(e.button !== 2) {
            const activeItems = this.store.getItemsFilteredByActive();

            // If click is affecting a child node of our element
            if(this.containerOuter.contains(e.target)) {

                // Prevent blur event triggering causing dropdown to close
                // in a race condition
                e.preventDefault();

                const hasShiftKey = e.shiftKey ? true : false;

                if(this.passedElement.type !== 'text' && !this.dropdown.classList.contains(this.options.classNames.activeState)) {
                    // For select inputs we always want to show the dropdown if it isn't already showing
                    this.showDropdown();
                }

                // If input is not in focus, it ought to be 
                if(this.input !== document.activeElement) {
                    this.input.focus();
                }

                if(e.target.hasAttribute('data-button')) {
                    if(this.options.removeItems && this.options.removeItemButton) {
                        const itemId       = e.target.parentNode.getAttribute('data-id');
                        const itemToRemove = activeItems.find((item) => item.id === parseInt(itemId));
                        this._removeItem(itemToRemove);
                    }
                } else if(e.target.hasAttribute('data-item')) {
                    // If we are clicking on an item
                    if(this.options.removeItems) {
                        const passedId = e.target.getAttribute('data-id');

                        // We only want to select one item with a click
                        // so we deselect any items that aren't the target
                        // unless shift is being pressed
                        activeItems.forEach((item) => {
                            if(item.id === parseInt(passedId) && !item.selected) {
                                this.selectItem(item);
                            } else if(!hasShiftKey) {
                                this.deselectItem(item);
                            }
                        });
                    }
                } else if(e.target.hasAttribute('data-option')) {
                    // If we are clicking on an option
                    const options = this.store.getChoicesFilteredByActive();
                    const id = e.target.getAttribute('data-id');
                    const option = options.find((option) => option.id === parseInt(id));

                    if(!option.selected && !option.disabled) {
                        this._addItem(option.value, option.label, option.id);
                        if(this.passedElement.type === 'select-one') {
                            this.input.value = "";
                            this.isSearching = false;
                            this.store.dispatch(activateChoices(true));
                            this.toggleDropdown();
                        }
                    }
                }

            } else {
                // Click is outside of our element so close dropdown and de-select items
                const hasActiveDropdown = this.dropdown.classList.contains(this.options.classNames.activeState);
                const hasSelectedItems  = activeItems.some((item) => item.selected === true);

                // De-select any highlighted items
                if(hasSelectedItems) this.unhighlightAll();
            
                // Remove focus state
                this.containerOuter.classList.remove(this.options.classNames.focusState);

                // Close all other dropdowns
                if(hasActiveDropdown) this.toggleDropdown();
            }
        }
    }

    /**
     * Mouse over (hover) event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onMouseOver(e) {
        // If the dropdown is either the target or one of its children is the target
        if((e.target === this.dropdown || findAncestor(e.target, this.options.classNames.listDropdown))) {
            if(e.target.hasAttribute('data-option')) {
                this._highlightChoice(e.target);
            }
        }
    }

    /**
     * Paste event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onPaste(e) {
        if(e.target !== this.input) return;
        // Disable pasting into the input if option has been set
        if(!this.options.paste) {
            e.preventDefault();
        }
    }


    /**
     * Focus event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onFocus(e) {
        const hasActiveDropdown = this.dropdown.classList.contains(this.options.classNames.activeState);
        if(e.target === this.input && !hasActiveDropdown) {
            this.containerOuter.classList.add(this.options.classNames.focusState);
            if(this.passedElement.type === 'select-one' || this.passedElement.type === 'select-multiple'){
                this.showDropdown();    
            }
        }
    }

    /**
     * Blur event
     * @param  {Object} e Event
     * @return
     * @private
     */
    _onBlur(e) {
        const hasActiveDropdown = this.dropdown.classList.contains(this.options.classNames.activeState);
        if(e.target === this.input && !hasActiveDropdown) {
            this.containerOuter.classList.remove(this.options.classNames.focusState);
        } else {
            this.hideDropdown();
        }
    }


    /**
     * Tests value against a regular expression
     * @param  {string} value   Value to test
     * @return {Boolean}        Whether test passed/failed
     * @private
     */
    _regexFilter(value) {
        if(!value) return;
        const expression = new RegExp(this.options.regexFilter, 'i');
        return expression.test(value);
    }

    /**
     * Scroll to an option element
     * @param  {HTMLElement} option  Option to scroll to
     * @param  {Number} direction  Whether option is above or below 
     * @return
     * @private
     */
    _scrollToChoice(option, direction) {
        if(!option) return;
        
        const dropdownHeight = this.choiceList.offsetHeight;
        const optionHeight   = option.offsetHeight;

        // Distance from bottom of element to top of parent
        const choicePos = option.offsetTop + optionHeight;
        
        // Scroll position of dropdown
        const containerScrollPos = this.choiceList.scrollTop + dropdownHeight;
        
        // Difference between the option and scroll position
        let endPoint = direction > 0 ? ((this.choiceList.scrollTop + choicePos) - containerScrollPos) : option.offsetTop;

        const animateScroll = (time, endPoint, direction) => {
            let continueAnimation = false;
            let easing, distance;
            const strength = 4;

            if(direction > 0) {
                easing = (endPoint - this.choiceList.scrollTop)/strength;
                distance = easing > 1 ? easing : 1;

                this.choiceList.scrollTop = this.choiceList.scrollTop + distance;
                if(this.choiceList.scrollTop < endPoint) {
                    continueAnimation = true;
                }
            } else {
                easing = (this.choiceList.scrollTop - endPoint)/strength;
                distance = easing > 1 ? easing : 1;

                this.choiceList.scrollTop = this.choiceList.scrollTop - distance;
                if(this.choiceList.scrollTop > endPoint) {
                    continueAnimation = true;
                }
            }

            if(continueAnimation) {
                requestAnimationFrame((time) => {
                    animateScroll(time, endPoint, direction);
                });
            }
        };

        requestAnimationFrame((time) => {
            animateScroll(time, endPoint, direction);
        });
    }

    /**
     * Highlight option element 
     * @param  {HTMLElement} el Element to highlight
     * @return
     * @private
     */
    _highlightChoice(el) {
        // Highlight first element in dropdown
        const options = Array.from(this.dropdown.querySelectorAll('[data-option-selectable]'));

        if(options && options.length) {
            const highlightedOptions = Array.from(this.dropdown.querySelectorAll(`.${this.options.classNames.highlightedState}`));
            
            // Remove any highlighted options 
            highlightedOptions.forEach((el) => {
                el.classList.remove(this.options.classNames.highlightedState);
            });

            if(el){
                // Highlight given option
                el.classList.add(this.options.classNames.highlightedState); 
                this.highlightPosition = options.indexOf(el);   
            } else {
                // Highlight option based on last known highlight location
                let el;

                if(options.length > this.highlightPosition) {
                    // If we have an option to highlight 
                    el = options[this.highlightPosition];
                } else {
                    // Otherwise highlight the option before
                    el = options[options.length - 1];
                }

                if(!el) el = options[0];
                el.classList.add(this.options.classNames.highlightedState);    
            }        
        }
    }


    /**
     * Add item to store with correct value
     * @param {String} value Value to add to store
     * @return {Object} Class instance
     * @public
     */
    _addItem(value, label, choiceId = -1, callback = this.options.callbackOnAddItem) {
        const items        = this.store.getItems();
        let passedValue    = value.trim();
        let passedLabel    = label || passedValue;
        let passedOptionId = choiceId || -1;

        // If a prepended value has been passed, prepend it
        if(this.options.prependValue) {
            passedValue = this.options.prependValue + passedValue.toString();
        }

        // If an appended value has been passed, append it
        if(this.options.appendValue) {
            passedValue = passedValue + this.options.appendValue.toString();
        }

        // Generate unique id
        const id = items ? items.length + 1 : 1;

        this.store.dispatch(addItem(passedValue, passedLabel, id, passedOptionId));

        if(this.passedElement.type === 'select-one') {
            this.removeActiveItems(id);
        }  

        // Run callback if it is a function
        if(callback){
            if(isType('Function', callback)) {
                callback(id, passedValue, this.passedElement);
            } else {
                console.error('callbackOnAddItem: Callback is not a function');
            }
        }

        return this;
    }

    /**
     * Remove item from store
     * @param
     * @return {Object} Class instance
     * @public
     */
    _removeItem(item, callback = this.options.callbackOnRemoveItem) {
        if(!item || !isType('Object', item)) {
            console.error('removeItem: No item object was passed to be removed');
            return;
        }

        const id       = item.id;
        const value    = item.value;
        const choiceId = item.choiceId;

        this.store.dispatch(removeItem(id, choiceId));

        // Run callback
        if(callback){
            if(!isType('Function', callback)) console.error('callbackOnRemoveItem: Callback is not a function'); return;
            callback(id, value, this.passedElement);
        }

        return this;
    }

    /** 
     * Add choice to dropdoww
     * @return
     * @private
     */
    _addChoice(isSelected, isDisabled, value, label, groupId = -1) {
        if(!value) return

        if(!label) { label = value; }

        // Generate unique id
        const choices    = this.store.getChoices();
        const id         = choices ? choices.length + 1 : 1;

        this.store.dispatch(addChoice(value, label, id, groupId, isDisabled));

        if(isSelected && !isDisabled) {
            this._addItem(value, label, id);
        }
    }

    /**
     * Add group to dropdown
     * @param {Object} group Group to add
     * @param {Number} index Whether this is the first group to add
     * @return
     * @private
     */
    _addGroup(group, id, isFirst) {
        const groupOptions = Array.from(group.getElementsByTagName('OPTION'));
        const groupId      = id;

        if(groupOptions) {
            this.store.dispatch(addGroup(group.label, groupId, true, group.disabled));
            groupOptions.forEach((option, optionIndex) => {
                const isDisabled = option.disabled || option.parentNode.disabled;
                this._addChoice(option.selected, isDisabled, option.value, option.innerHTML, groupId);   
            });
        } else {
            this.store.dispatch(addGroup(group.label, group.id, false, group.disabled));
        }
    }

    /**
     * Get template from name
     * @param  {String}    template Name of template to get
     * @param  {...}       args     Data to pass to template
     * @return {HTMLElement}        Template
     * @private
     */
    _getTemplate(template, ...args) {
        if(!template) return;
        const templates = this.options.templates;
        return templates[template](...args);
    }

    /**
     * Create HTML element based on type and arguments
     * @return
     * @private
     */
    _createTemplates() {
        const classNames = this.options.classNames;
        const templates = {
            containerOuter: () => {
                return strToEl(`<div class="${ classNames.containerOuter }" data-type="${ this.passedElement.type }"></div>`);
            },
            containerInner: () => {
                return strToEl(`<div class="${ classNames.containerInner }"></div>`);
            },
            itemList: () => {
                return strToEl(`<div class="${ classNames.list } ${ this.passedElement.type === 'select-one' ? classNames.listSingle : classNames.listItems }"></div>`);
            },
            choiceList: () => {
                return strToEl(`<div class="${ classNames.list }"></div>`);
            },
            input: () => {
                return strToEl(`<input type="text" class="${ classNames.input } ${ classNames.inputCloned }">`);
            },
            dropdown: () => {
                return strToEl(`<div class="${ classNames.list } ${ classNames.listDropdown }"></div>`);
            },
            notice: (label, clickable) => {
                return strToEl(`<div class="${ classNames.item } ${ classNames.itemChoice }">${ label }</div>`);
            },
            selectOption: (data) => {
                return strToEl(`<option value="${ data.value }" selected>${ data.label.trim() }</option>`);
            },
            option: (data) => {
                return strToEl(`
                    <div class="${ classNames.item } ${ classNames.itemChoice } ${ data.disabled ? classNames.itemDisabled : classNames.itemSelectable }" data-option ${ data.disabled ? 'data-option-disabled' : 'data-option-selectable' } data-id="${ data.id }" data-value="${ data.value }">
                        ${ data.label }
                    </div>
                `);
            },
            optgroup: (data) => {
                return strToEl(`
                    <div class="${ classNames.group } ${ data.disabled ? classNames.itemDisabled : '' }" data-group data-id="${ data.id }" data-value="${ data.value }">
                        <div class="${ classNames.groupHeading }">${ data.value }</div>
                    </div>
                `);
            },
            item: (data) => {
                if(this.options.removeItemButton && this.passedElement.type !== 'select-one') {
                    return strToEl(`
                        <div class="${ classNames.item } ${ data.selected ? classNames.selectedState : ''} ${ !data.disabled ? classNames.itemSelectable : '' }" data-item data-id="${ data.id }" data-value="${ data.value }" data-deletable>
                            ${ data.label }
                            <button class="${ classNames.button }" data-button>Remove item</button>
                        </div>
                    `);
                } else {
                    return strToEl(`
                        <div class="${ classNames.item } ${ data.selected ? classNames.selectedState : classNames.itemSelectable }" data-item data-id="${ data.id }" data-value="${ data.value }">
                            ${ data.label }
                        </div>
                    `);
                }   
            },
        };

        this.options.templates = extend(this.options.templates, templates);
    }

    /**
     * Create DOM structure around passed select element
     * @return
     * @private
     */
    _createInput() {
        const containerOuter = this._getTemplate('containerOuter');
        const containerInner = this._getTemplate('containerInner');
        const itemList       = this._getTemplate('itemList');
        const choiceList     = this._getTemplate('choiceList');
        const input          = this._getTemplate('input');
        const dropdown       = this._getTemplate('dropdown');

        this.containerOuter = containerOuter;
        this.containerInner = containerInner;
        this.input          = input;
        this.choiceList     = choiceList;
        this.itemList       = itemList;
        this.dropdown       = dropdown;

        // Hide passed input
        this.passedElement.classList.add(this.options.classNames.input, this.options.classNames.hiddenState);
        this.passedElement.tabIndex = '-1';
        this.passedElement.setAttribute('style', 'display:none;');
        this.passedElement.setAttribute('aria-hidden', 'true');
        this.passedElement.removeAttribute('data-choice');

        // Wrap input in container preserving DOM ordering
        wrap(this.passedElement, containerInner);

        // Wrapper inner container with outer container
        wrap(containerInner, containerOuter);
        
        // If placeholder has been enabled and we have a value
        if (this.options.placeholder && (this.options.placeholderValue || this.passedElement.placeholder)) {
            const placeholder = this.options.placeholderValue || this.passedElement.placeholder;
            input.placeholder = placeholder;  
            if(this.passedElement.type !== 'select-one') {
                input.style.width = getWidthOfInput(input);
            }
        }

        if(!this.options.addItems) this.disable();

        containerOuter.appendChild(containerInner);
        containerOuter.appendChild(dropdown);
        containerInner.appendChild(itemList);
        dropdown.appendChild(choiceList);

        if(this.passedElement.type === 'select-multiple' || this.passedElement.type === 'text') {
            containerInner.appendChild(input);
        } else if(this.options.searchOptions) {
            dropdown.insertBefore(input, dropdown.firstChild);
        }

        if(this.passedElement.type === 'select-multiple' || this.passedElement.type === 'select-one') {
            this.highlightPosition = 0;
            
            const passedGroups = Array.from(this.passedElement.getElementsByTagName('OPTGROUP'));
        
            this.isSearching = false;
        
            if(passedGroups && passedGroups.length) {
                passedGroups.forEach((group, index) => {
                    const isFirst = index === 0 ? true : false;
                    this._addGroup(group, index, isFirst);
                });
            } else {
                const passedOptions = Array.from(this.passedElement.options);
                passedOptions.forEach((option) => {
                    const isDisabled = option.disabled || option.parentNode.disabled;
                    this._addChoice(option.selected, isDisabled, option.value, option.innerHTML);
                });
            }

        } else if(this.passedElement.type === 'text') {
            // Add any preset values seperated by delimiter
            this.presetItems.forEach((item) => {
                if(isType('Object', item)) {
                    if(!item.value) return;
                    this._addItem(item.value, item.label, item.id);
                } else if(isType('String', item)) {
                    this._addItem(item);
                }
            });
        }
    }

    /**
     * Render group options into a DOM fragment and append to options list
     * @param  {Array} groups    Groups to add to list
     * @param  {Array} options   Options to add to groups
     * @param  {DocumentFragment} fragment Fragment to add groups and options to (optional)
     * @return {DocumentFragment} Populated options fragment
     * @private
     */
    renderGroups(groups, options, fragment) {
        const groupFragment = fragment || document.createDocumentFragment();

        groups.forEach((group, i) => {
            // Grab options that are children of this group
            const groupOptions = options.filter((option) => {
                if(this.passedElement.type === 'select-one') {
                    return option.groupId === group.id    
                } else {
                    return option.groupId === group.id && !option.selected;
                }
            });

            if(groupOptions.length >= 1) {
                const dropdownGroup = this._getTemplate('optgroup', group);

                groupFragment.appendChild(dropdownGroup);

                this.renderOptions(groupOptions, groupFragment);
            }
        });

        return groupFragment;
    }

    /**
     * Render options into a DOM fragment and append to options list
     * @param  {Array} options    Options to add to list
     * @param  {DocumentFragment} fragment Fragment to add options to (optional)
     * @return {DocumentFragment} Populated options fragment
     * @private
     */
    renderOptions(options, fragment) {
        // Create a fragment to store our list items (so we don't have to update the DOM for each item)
        const optsFragment = fragment || document.createDocumentFragment();

        options.forEach((option, i) => {
            const dropdownItem = this._getTemplate('option', option);

            if(this.passedElement.type === 'select-one') {
                optsFragment.appendChild(dropdownItem);    
            } else if(!option.selected) {
                optsFragment.appendChild(dropdownItem);   
            }
        });

        return optsFragment;
    }

    /**
     * Render items into a DOM fragment and append to items list
     * @param  {Array} items    Items to add to list
     * @param  {DocumentFragment} fragment Fragrment to add items to (optional)
     * @return
     * @private
     */
    renderItems(items, fragment) {
        // Create fragment to add elements to
        const itemListFragment = fragment || document.createDocumentFragment();
        // Simplify store data to just values
        const itemsFiltered = this.store.getItemsReducedToValues(items);

        if(this.passedElement.type === 'text') {
            // Assign hidden input array of values
            this.passedElement.setAttribute('value', itemsFiltered.join(this.options.delimiter));          
        } else {
            const selectedOptionsFragment = document.createDocumentFragment();

            // Add each list item to list
            items.forEach((item) => {
                // Create a standard select option
                const option = this._getTemplate('selectOption', item);

                // Append it to fragment
                selectedOptionsFragment.appendChild(option);
            });

            // Update selected options
            this.passedElement.innerHTML = "";
            this.passedElement.appendChild(selectedOptionsFragment);
        }

        // Add each list item to list
        items.forEach((item) => {
            // Create new list element 
            const listItem = this._getTemplate('item', item);

            // Append it to list
            itemListFragment.appendChild(listItem);
        });

        return itemListFragment;
    }

    /**
     * Render DOM with values
     * @return
     * @private
     */
    render() {
        this.currentState = this.store.getState();

        // Only render if our state has actually changed
        if(this.currentState !== this.prevState) {

            // Options
            if((this.currentState.options !== this.prevState.options || this.currentState.groups !== this.prevState.groups)) {
                if(this.passedElement.type === 'select-multiple' || this.passedElement.type === 'select-one') {
                    // Get active groups/options
                    const activeGroups    = this.store.getGroupsFilteredByActive();
                    const activeChoices   = this.store.getChoicesFilteredByActive();

                    let choiceListFragment = document.createDocumentFragment();

                    // Clear options
                    this.choiceList.innerHTML = '';

                    // If we have grouped options
                    if(activeGroups.length >= 1 && this.isSearching !== true) {
                        choiceListFragment = this.renderGroups(activeGroups, activeChoices, choiceListFragment);
                    } else if(activeChoices.length >= 1) {
                        choiceListFragment = this.renderOptions(activeChoices, choiceListFragment);
                    }

                    if(choiceListFragment.children.length) {
                        // If we actually have anything to add to our dropdown
                        // append it and highlight the first option
                        this.choiceList.appendChild(choiceListFragment);
                        this._highlightChoice();
                    } else {
                        // Otherwise show a notice
                        const dropdownItem = this.isSearching ? this._getTemplate('notice', 'No results found') : this._getTemplate('notice', 'No choices to choose from');
                        this.choiceList.appendChild(dropdownItem);
                    }
                }
            }
            
            // Items
            if(this.currentState.items !== this.prevState.items) {
                const activeItems = this.store.getItemsFilteredByActive();
                if(activeItems) {
                    // Create a fragment to store our list items (so we don't have to update the DOM for each item)
                    const itemListFragment = this.renderItems(activeItems);

                    // Clear list
                    this.itemList.innerHTML = '';

                    // If we have items to add
                    if(itemListFragment.children.length) {
                        // Update list
                        this.itemList.appendChild(itemListFragment);
                    }
                }
            }

            this.prevState = this.currentState;
        }
    }

    /**
     * Trigger event listeners
     * @return
     * @private
     */
    _addEventListeners() {
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mouseover', this._onMouseOver);

        this.input.addEventListener('input', this._onInput);
        this.input.addEventListener('paste', this._onPaste);
        this.input.addEventListener('focus', this._onFocus);
        this.input.addEventListener('blur', this._onBlur);
    }

    /**
     * Destroy event listeners
     * @return
     * @private
     */
    _removeEventListeners() {
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mouseover', this._onMouseOver);
        
        this.input.removeEventListener('input', this._onInput);
        this.input.removeEventListener('paste', this._onPaste);
        this.input.removeEventListener('focus', this._onFocus);
        this.input.removeEventListener('blur', this._onBlur);
    }
};

window.Choices = module.exports = Choices;