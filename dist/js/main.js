let subnetMap = {};
let subnetNotes = {};
let maxNetSize = 0;
let infoColumnCount = 6
// NORMAL mode:
//   - Smallest subnet: /32
//   - Two reserved addresses per subnet of size <= 30:
//     - Net+0 = Network Address
//     - Last = Broadcast Address
// AWS mode:
//   - Smallest subnet: /28
//   - Two reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = AWS Reserved - VPC Router
//     - Net+2 = AWS Reserved - VPC DNS
//     - Net+3 = AWS Reserved - Future Use
//     - Last = Broadcast Address
// Azure mode:
//   - Smallest subnet: /29
//   - Two reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = Reserved - Default Gateway
//     - Net+2 = Reserved - DNS Mapping
//     - Net+3 = Reserved - DNS Mapping
//     - Last = Broadcast Address
// OCI mode:
//   - Smallest subnet: /30
//   - Three reserved addresses per subnet:
//     - Net+0 = Network Address
//     - Net+1 = OCI Reserved - Default Gateway Address
//     - Last = Broadcast Address
let noteTimeout;
let groupTimeout;
let operatingMode = 'Standard'
let previousOperatingMode = 'Standard'
let inflightColor = 'NONE'
let selectionMode = 'normal'
let urlVersion = '1'
let configVersion = '2'

const netsizePatterns = {
    Standard: '^([12]?[0-9]|3[0-2])$',
    AZURE: '^([12]?[0-9])$',
    AWS: '^(1?[0-9]|2[0-8])$',
    OCI: '^([12]?[0-9]|30)$',
};

const minSubnetSizes = {
    Standard: 32,
    AZURE: 29,
    AWS: 28,
    OCI: 30,
};

$('input#network').on('paste', function (e) {
    let pastedData = window.event.clipboardData.getData('text')
    if (pastedData.includes('/')) {
        let [network, netSize] = pastedData.split('/')
        $('#network').val(network)
        $('#netsize').val(netSize)
    }
    e.preventDefault()
});

$("input#network").on('keydown', function (e) {
    if (e.key === '/') {
        e.preventDefault()
        $('input#netsize').focus().select()
    }
});

$('input#network,input#netsize').on('input', function() {
    $('#input_form')[0].classList.add('was-validated');
})

$('#color_palette div').on('click', function() {
    // We don't really NEED to convert this to hex, but it's really low overhead to do the
    // conversion here and saves us space in the export/save
    inflightColor = rgba2hex($(this).css('background-color'))
})

$('#calcbody').on('click', '.row_address, .row_range, .row_usable, .row_hosts, .note, input', function(event) {
    // When in "collapse" selection mode (and not currently applying a color),
    // clicking on a subnet row toggles the collapsed state for that subnet.
    if (selectionMode === 'collapse' && inflightColor === 'NONE' && this.dataset.subnet) {
        mutate_subnet_map('collapse', this.dataset.subnet, '')
        renderTable(operatingMode);
        return;
    }

    // Default behaviour: apply color when a palette color is selected.
    if (inflightColor !== 'NONE' && this.dataset.subnet) {
        mutate_subnet_map('color', this.dataset.subnet, '', inflightColor)
        // We could re-render here, but there is really no point, keep performant and just change the background color now
        //renderTable();
        $(this).closest('tr').css('background-color', inflightColor)
    }
})

$('#btn_go').on('click', function() {
    $('#input_form').removeClass('was-validated');
    $('#input_form').validate();
    if ($('#input_form').valid()) {
        $('#input_form')[0].classList.add('was-validated');
        reset();
        // Additional actions upon validation can be added here
    } else {
        show_warning_modal('<div>Please correct the errors in the form!</div>');
    }

})

$('#dropdown_standard').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'Standard';

    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }

});

$('#dropdown_azure').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'AZURE';

    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }

});

$('#dropdown_aws').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'AWS';

    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }
});

$('#dropdown_oci').click(function() {
    previousOperatingMode = operatingMode;
    operatingMode = 'OCI';

    if(!switchMode(operatingMode)) {
        operatingMode = previousOperatingMode;
        $('#dropdown_'+ operatingMode.toLowerCase()).addClass('active');
    }
});

$('#importBtn').on('click', function() {
    importConfig(JSON.parse($('#importExportArea').val()))
})

$('#bottom_nav #colors_word_open').on('click', function() {
    $('#bottom_nav #color_palette').removeClass('d-none');
    $('#bottom_nav #colors_word_close').removeClass('d-none');
    $('#bottom_nav #colors_word_open').addClass('d-none');
})

$('#bottom_nav #colors_word_close').on('click', function() {
    $('#bottom_nav #color_palette').addClass('d-none');
    $('#bottom_nav #colors_word_close').addClass('d-none');
    $('#bottom_nav #colors_word_open').removeClass('d-none');
    inflightColor = 'NONE'
})

// Selection mode controls
$('#selection_mode_normal').on('click', function() {
    selectionMode = 'normal';
    $('#selection_mode_normal, #selection_mode_collapse, #selection_mode_label').removeClass('active');
    $('#selection_mode_normal').addClass('active');
})

$('#selection_mode_collapse').on('click', function() {
    selectionMode = 'collapse';
    $('#selection_mode_normal, #selection_mode_collapse, #selection_mode_label').removeClass('active');
    $('#selection_mode_collapse').addClass('active');
})

$('#selection_mode_label').on('click', function() {
    selectionMode = 'label';
    $('#selection_mode_normal, #selection_mode_collapse, #selection_mode_label').removeClass('active');
    $('#selection_mode_label').addClass('active');
})

$('#bottom_nav #copy_url').on('click', function() {
    // TODO: Provide a warning here if the URL is longer than 2000 characters, probably using a modal.
    let url = window.location.origin + getConfigUrl()
    navigator.clipboard.writeText(url);
    $('#bottom_nav #copy_url span').text('Copied!')
    // Swap the text back after 3sec
    setTimeout(function(){
        $('#bottom_nav #copy_url span').text('Copy Shareable URL')
    }, 2000)
})

$('#btn_import_export').on('click', function() {
    $('#importExportArea').val(JSON.stringify(exportConfig(false), null, 2))
})

function reset() {

    set_usable_ips_title(operatingMode);

    let cidrInput = $('#network').val() + '/' + $('#netsize').val()
    let rootNetwork = get_network($('#network').val(), $('#netsize').val())
    let rootCidr = rootNetwork + '/' + $('#netsize').val()
    if (cidrInput !== rootCidr) {
        show_warning_modal('<div>Your network input is not on a network boundary for this network size. It has been automatically changed:</div><div class="font-monospace pt-2">' + $('#network').val() + ' -> ' + rootNetwork + '</div>')
        $('#network').val(rootNetwork)
        cidrInput = $('#network').val() + '/' + $('#netsize').val()
    }
    if (Object.keys(subnetMap).length > 0) {
        // This page already has data imported, so lets see if we can just change the range
        if (isMatchingSize(Object.keys(subnetMap)[0], cidrInput)) {
            subnetMap = changeBaseNetwork(cidrInput)
        } else {
            // This is a page with existing data of a different subnet size, so make it blank
            // Could be an opportunity here to do the following:
            //   - Prompt the user to confirm they want to clear the existing data
            //   - Resize the existing data anyway by making the existing network a subnetwork of their new input (if it
            //     is a larger network), or by just trimming the network to the new size (if it is a smaller network),
            //     or even resizing all of the containing networks by change in size of the base network. For example a
            //     base network going from /16 -> /18 would be all containing networks would be resized smaller (/+2),
            //     or bigger (/-2) if going from /18 -> /16.
            subnetMap = {}
            subnetMap[rootCidr] = {}
        }
    } else {
        // This is a fresh page load with no existing data
        subnetMap[rootCidr] = {}
    }
    maxNetSize = parseInt($('#netsize').val())
    renderTable(operatingMode);
}

function changeBaseNetwork(newBaseNetwork) {
    // Minifiy it, to make all the keys in the subnetMap relative to their original base network
    // Then expand it, but with the new CIDR as the base network, effectively converting from old to new.
    let miniSubnetMap = {}
    minifySubnetMap(miniSubnetMap, subnetMap, Object.keys(subnetMap)[0])
    let newSubnetMap = {}
    expandSubnetMap(newSubnetMap, miniSubnetMap, newBaseNetwork)
    return newSubnetMap
}

function isMatchingSize(subnet1, subnet2) {
    return subnet1.split('/')[1] === subnet2.split('/')[1];
}

$('#calcbody').on('click', 'td.split,td.join', function(event) {
    // HTML DOM Data elements! Yay! See the `data-*` attributes of the HTML tags
    if (!this.dataset.subnet) {
        return;
    }

    if (selectionMode === 'label') {
        const subnet = this.dataset.subnet;
        const currentLabel = get_subnet_property(subnet, '_group') || '';

        // Remove any existing inline editors before creating a new one
        $('#calcbody').find('input.label-editor').each(function() {
            const $input = $(this);
            const dataSubnet = $input.data('subnet');
            const newValue = $input.val();
            if (dataSubnet) {
                mutate_subnet_map('group', dataSubnet, '', newValue);
            }
            $input.closest('td').data('editing', false);
        }).remove();

        const $cell = $(this);
        if ($cell.data('editing')) {
            return;
        }
        $cell.data('editing', true);

        const $input = $('<input type="text" class="form-control form-control-sm label-editor" />');
        $input.val(currentLabel);
        $input.attr('data-subnet', subnet);

        $cell.empty().append($input);
        $input.focus().select();

        const commitAndRender = () => {
            const newValue = $input.val();
            mutate_subnet_map('group', subnet, '', newValue);
            $cell.data('editing', false);
            renderTable(operatingMode);
        };

        $input.on('blur', function() {
            commitAndRender();
        });

        $input.on('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitAndRender();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                $cell.data('editing', false);
                renderTable(operatingMode);
            }
        });

        return;
    } else if (selectionMode === 'collapse') {
        // In collapse mode, clicking the split/join area simply toggles the
        // collapsed state for that subnet without changing the underlying data.
        mutate_subnet_map('collapse', this.dataset.subnet, '')
    } else {
        mutate_subnet_map(this.dataset.mutateVerb, this.dataset.subnet, '')
        this.dataset.subnet = sortIPCIDRs(this.dataset.subnet)
    }

    renderTable(operatingMode);
})

$('#calcbody').on('keyup', 'td.note input', function(event) {
    // HTML DOM Data elements! Yay! See the `data-*` attributes of the HTML tags
    let delay = 1000;
    clearTimeout(noteTimeout);
    noteTimeout = setTimeout(function(element) {
        mutate_subnet_map('note', element.dataset.subnet, '', element.value)
    }, delay, this);
})

$('#calcbody').on('focusout', 'td.note input', function(event) {
    // HTML DOM Data elements! Yay! See the `data-*` attributes of the HTML tags
    clearTimeout(noteTimeout);
    mutate_subnet_map('note', this.dataset.subnet, '', this.value)
})

$('#calcbody').on('keyup', 'td.group input', function(event) {
    // Group labels are saved with a short debounce similar to notes
    let delay = 1000;
    clearTimeout(groupTimeout);
    groupTimeout = setTimeout(function(element) {
        mutate_subnet_map('group', element.dataset.subnet, '', element.value)
    }, delay, this);
})

$('#calcbody').on('focusout', 'td.group input', function(event) {
    clearTimeout(groupTimeout);
    mutate_subnet_map('group', this.dataset.subnet, '', this.value)
})

$('#subnetSearch').on('input', function() {
    applySubnetFilters();
});

$('#minMaskFilter').on('input change', function() {
    // Re-render the table when the mask filter changes so that the
    // visual split/join columns (colspans) stay consistent with the
    // currently visible subnet sizes.
    renderTable(operatingMode);
});


function renderTable(operatingMode) {
    // TODO: Validation Code
    $('#calcbody').empty();

    // 1. Flatten the subnet map into a sorted list of visible rows
    //    Each row contains its own data + list of ancestors
    const rows = getSubnetRows(subnetMap);

    // 2. Identify all unique mask sizes present in the map (to define columns)
    const sizes = new Set();
    collect_mask_sizes(subnetMap, sizes);
    const sortedSizes = Array.from(sizes).sort((a, b) => b - a);

    // 3. Update the table header with these sizes
    updateMaskHeader(sortedSizes);

    // 4. Calculate rowspans for the "Join" columns
    //    This modifies the 'rows' objects to include render instructions
    calculateRenderPlan(rows, sortedSizes);

    // 5. Render the rows
    const maxDepth = get_dict_max_depth(subnetMap, 0); // Kept for Note width logic
    rows.forEach(row => {
        $('#calcbody').append(buildRowHtml(row, sortedSizes, maxDepth, operatingMode));
    });

    applySubnetFilters();
}

function getSubnetRows(subnetTree, ancestors = {}) {
    let rows = [];

    // Sort keys by IP
    let keys = Object.keys(subnetTree).filter(k => !k.startsWith('_'));
    keys.sort((a, b) => {
        let ipA = ip2int(a.split('/')[0]);
        let ipB = ip2int(b.split('/')[0]);
        return ipA - ipB;
    });

    for (let mapKey of keys) {
        const node = subnetTree[mapKey];
        const isCollapsed = !!node['_collapsed'];
        const hasChildren = has_network_sub_keys(node);
        const [network, sizeStr] = mapKey.split('/');
        const size = parseInt(sizeStr);

        if (hasChildren && !isCollapsed) {
            const newAncestors = { ...ancestors };
            newAncestors[size] = mapKey;
            rows = rows.concat(getSubnetRows(node, newAncestors));
        } else {
            rows.push({
                cidr: mapKey,
                network: network,
                netSize: size,
                data: node,
                ancestors: { ...ancestors },
                hasChildren: hasChildren,
                isCollapsed: isCollapsed
            });
        }
    }
    return rows;
}

function calculateRenderPlan(rows, sortedSizes) {
    // Initialize 'renderCells' on each row.
    rows.forEach(row => row.renderCells = {});

    // For each column size
    sortedSizes.forEach(size => {
        let currentAncestor = null;
        let startIndex = -1;
        let spanCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const ancestorAtSize = row.ancestors[size]; // The CIDR string of the ancestor at this size

            // Special Case: The row itself matches this size (It's the Split button)
            if (row.netSize === size) {
                row.renderCells[size] = { type: 'split' };
                continue;
            }

            // Ancestor Logic
            if (ancestorAtSize) {
                if (ancestorAtSize !== currentAncestor) {
                    // New block starting
                    // 1. Commit previous block
                    if (currentAncestor && startIndex !== -1) {
                        rows[startIndex].renderCells[size] = { type: 'join', span: spanCount, cidr: currentAncestor };
                    }

                    // 2. Start new block
                    currentAncestor = ancestorAtSize;
                    startIndex = i;
                    spanCount = 1;
                } else {
                    // Continuation
                    spanCount++;
                }
            } else {
                // No ancestor at this size (Gap/Spacer)
                // Commit previous block
                if (currentAncestor && startIndex !== -1) {
                    rows[startIndex].renderCells[size] = { type: 'join', span: spanCount, cidr: currentAncestor };
                }
                currentAncestor = null;
                startIndex = -1;
                spanCount = 0;

                // Mark as spacer
                row.renderCells[size] = { type: 'spacer' };
            }
        }

        // Commit final block
        if (currentAncestor && startIndex !== -1) {
            rows[startIndex].renderCells[size] = { type: 'join', span: spanCount, cidr: currentAncestor };
        }
    });
}

function buildRowHtml(row, sortedSizes, maxDepth, operatingMode) {
    let styleTag = ''
    if (row.data['_color']) {
        styleTag = ' style="background-color: ' + row.data['_color'] + '"'
    }

    let addressFirst = ip2int(row.network)
    let addressLast = subnet_last_address(addressFirst, row.netSize)
    let usableFirst = subnet_usable_first(addressFirst, row.netSize, operatingMode)
    let usableLast = subnet_usable_last(addressFirst, row.netSize)
    let hostCount = 1 + usableLast - usableFirst
    let rangeCol = (row.netSize < 32) ? int2ip(addressFirst) + ' - ' + int2ip(addressLast) : int2ip(addressFirst);
    let usableCol = (row.netSize < 32) ? int2ip(usableFirst) + ' - ' + int2ip(usableLast) : int2ip(usableFirst);
    let rowId = 'row_' + row.network.replace(/\./g, '-') + '_' + row.netSize
    let splitLabel = (row.data['_group'] && row.data['_group'].trim() !== '') ? row.data['_group'] : '';
    let collapseIndicator = row.hasChildren ? (row.isCollapsed ? '\u25b6' : '\u25bc') : '';

    // Notes Width Calculation
    let notesWidth = '30%';
    if ((maxDepth > 5) && (maxDepth <= 10)) notesWidth = '25%';
    else if ((maxDepth > 10) && (maxDepth <= 15)) notesWidth = '20%';
    else if ((maxDepth > 15) && (maxDepth <= 20)) notesWidth = '15%';
    else if (maxDepth > 20) notesWidth = '10%';

    let html = `
        <tr id="${rowId}"${styleTag} aria-label="${row.cidr}">
            <td data-subnet="${row.cidr}" aria-labelledby="${rowId} subnetHeader" class="row_address">${row.cidr}</td>
            <td data-subnet="${row.cidr}" aria-labelledby="${rowId} sizeHeader" class="row_size">/${row.netSize}</td>
            <td data-subnet="${row.cidr}" aria-labelledby="${rowId} rangeHeader" class="row_range">${rangeCol}</td>
            <td data-subnet="${row.cidr}" aria-labelledby="${rowId} useableHeader" class="row_usable">${usableCol}</td>
            <td data-subnet="${row.cidr}" aria-labelledby="${rowId} hostsHeader" class="row_hosts">${hostCount}</td>
            <td class="group"><label><input aria-labelledby="${rowId} groupHeader" type="text" class="form-control shadow-none p-0" data-subnet="${row.cidr}" value="${row.data['_group'] || ''}"></label></td>
            <td class="note" style="width:${notesWidth}"><label><input aria-labelledby="${rowId} noteHeader" type="text" class="form-control shadow-none p-0" data-subnet="${row.cidr}" value="${row.data['_note'] || ''}"></label></td>
    `;

    // Render Columns
    for (let i = 0; i < sortedSizes.length; i++) {
        const size = sortedSizes[i];
        const cell = row.renderCells[size];

        if (!cell) {
            continue;
        }

        if (cell.type === 'join') {
             let joinLabel = get_subnet_property(cell.cidr, '_group') || '';
             html += `<td aria-label="${cell.cidr} Join" rowspan="${cell.span}" class="join rotate" data-subnet="${cell.cidr}" data-mutate-verb="join"><span>${joinLabel}</span></td>`;
        } else if (cell.type === 'spacer') {
             html += `<td></td>`;
        } else if (cell.type === 'split') {
             let colspan = 1;
             html += `<td data-subnet="${row.cidr}" aria-labelledby="${rowId} splitHeader" rowspan="1" colspan="${colspan}" class="split rotate" data-mutate-verb="split"><span>${collapseIndicator}${splitLabel ? ' ' + splitLabel : ''}</span></td>`;
        }
    }

    html += '</tr>';
    return html;
}

function updateMaskHeader(sortedSizes) {
    if (!sortedSizes) {
        const sizes = new Set();
        collect_mask_sizes(subnetMap, sizes);
        sortedSizes = Array.from(sizes).sort((a, b) => a - b);
    }

    const splitHeader = $('#splitHeader');

    if (!splitHeader.length) {
        return;
    }

    if (sortedSizes.length === 0) {
        splitHeader.text('Split');
        return;
    }

    const headerText = sortedSizes.map(size => '/' + size).join(' ');
    splitHeader.text(headerText);
}

function applySubnetFilters() {
    const searchTerm = ($('#subnetSearch').val() || '').toString().toLowerCase().trim();
    const maskFilterRaw = $('#minMaskFilter').val();
    const maskFilter = maskFilterRaw === '' ? null : parseInt(maskFilterRaw, 10);

    $('#calcbody tr').each(function() {
        const $row = $(this);
        const cidrText = ($row.find('.row_address').text() || '').toLowerCase();
        const groupText = ($row.find('td.group input').val() || '').toLowerCase();
        const noteText = ($row.find('td.note input').val() || '').toLowerCase();

        const combinedText = cidrText + ' ' + groupText + ' ' + noteText;
        const matchesSearch = !searchTerm || combinedText.indexOf(searchTerm) !== -1;

        let matchesMask = true;
        if (maskFilter !== null && !Number.isNaN(maskFilter)) {
            const cidrParts = cidrText.split('/');
            const maskPart = cidrParts.length === 2 ? parseInt(cidrParts[1], 10) : NaN;
            // Show only subnets with mask <= selected value (hide smaller, more specific ranges)
            matchesMask = !Number.isNaN(maskPart) ? (maskPart <= maskFilter) : true;
        }

        $row.toggle(matchesSearch && matchesMask);
    });
}


// Helper Functions
function ip2int(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
}

function int2ip (ipInt) {
    return ((ipInt>>>24) + '.' + (ipInt>>16 & 255) + '.' + (ipInt>>8 & 255) + '.' + (ipInt & 255));
}

function toBase36(num) {
    return num.toString(36);
}

function fromBase36(str) {
    return parseInt(str, 36);
}

/**
 * Coordinate System for Subnet Representation
 *
 * This system aims to represent subnets efficiently within a larger network space.
 * The goal is to produce the shortest possible string representation for subnets,
 * which is particularly effective when dealing with hierarchical network designs.
 *
 * Key concept:
 * - We represent a subnet by its ordinal position within a larger network,
 *   along with its mask size.
 * - This approach is most efficient when subnets are relatively close together
 *   in the address space and of similar sizes.
 *
 * Benefits:
 * 1. Compact representation: Often results in very short strings (e.g., "7k").
 * 2. Hierarchical: Naturally represents subnet hierarchy.
 * 3. Efficient for common cases: Works best for typical network designs where
 *    subnets are grouped and of similar sizes.
 *
 * Trade-offs:
 * - Less efficient for representing widely dispersed or highly varied subnet sizes.
 * - Requires knowledge of the base network to interpret.
 *
 * Extreme Example... Representing the value 192.168.200.210/31 within the base
 * network of 192.168.200.192/27. These are arbitrary but long subnets to represent
 * as a string.
 * - Normal Way - '192.168.200.210/31'
 * - Nth Position Way - '9v'
 *   - '9' represents the 9th /31 subnet within the /27
 *   - 'v' represents the /31 mask size converted to Base 36 (31 -> 'v')
 */

/**
 * Converts a specific subnet to its Nth position representation within a base network.
 *
 * @param {string} baseNetwork - The larger network containing the subnet (e.g., "10.0.0.0/16")
 * @param {string} specificSubnet - The subnet to be represented (e.g., "10.0.112.0/20")
 * @returns {string} A compact string representing the subnet's position and size (e.g., "7k")
 */
function getNthSubnet(baseNetwork, specificSubnet) {
    const [baseIp, baseMask] = baseNetwork.split('/');
    const [specificIp, specificMask] = specificSubnet.split('/');

    const baseInt = ip2int(baseIp);
    const specificInt = ip2int(specificIp);

    const baseSize = 32 - parseInt(baseMask, 10);
    const specificSize = 32 - parseInt(specificMask, 10);

    const offset = specificInt - baseInt;
    const nthSubnet = offset >>> specificSize;

    return `${nthSubnet}${toBase36(parseInt(specificMask, 10))}`;
}


/**
 * Reconstructs a subnet from its Nth position representation within a base network.
 *
 * @param {string} baseNetwork - The larger network containing the subnet (e.g., "10.0.0.0/16")
 * @param {string} nthString - The compact representation of the subnet (e.g., "7k")
 * @returns {string} The full subnet representation (e.g., "10.0.112.0/20")
 */
// Takes 10.0.0.0/16 and '7k' and returns 10.0.96.0/20
// '10.0.96.0/20' being the 7th /20 (base36 'k' is 20 int) within the /16.
function getSubnetFromNth(baseNetwork, nthString) {
    const [baseIp, baseMask] = baseNetwork.split('/');
    const baseInt = ip2int(baseIp);

    const size = fromBase36(nthString.slice(-1));
    const nth = parseInt(nthString.slice(0, -1), 10);

    const innerSizeInt = 32 - size;
    const subnetInt = baseInt + (nth << innerSizeInt);

    return `${int2ip(subnetInt)}/${size}`;
}

function subnet_last_address(subnet, netSize) {
    return subnet + subnet_addresses(netSize) - 1;
}

function subnet_addresses(netSize) {
    return 2**(32-netSize);
}

function subnet_usable_first(network, netSize, operatingMode) {
    if (netSize < 31) {
        // https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
        // AWS reserves 3 additional IPs
        // https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets
        // Azure reserves 3 additional IPs
        // https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet
        // OCI reserves 2 additional IPs
        //return network + (operatingMode == 'Standard' ? 1 : 4);
        switch (operatingMode) {
            case 'AWS':
            case 'AZURE':
                return network + 4;
                break;
            case 'OCI':
                return network + 2;
                break;
            default:
                return network + 1;
                break;
        }            
    } else {
        return network;
    }
}

function subnet_usable_last(network, netSize) {
    let last_address = subnet_last_address(network, netSize);
    if (netSize < 31) {
        return last_address - 1;
    } else {
        return last_address;
    }
}

function get_dict_max_depth(dict, curDepth) {
    let maxDepth = curDepth

    // Take the current "Show up to size" filter into account so that
    // hidden, more-specific subnets do not affect how wide the visual
    // split/join columns are rendered.
    const maskFilterRaw = $('#minMaskFilter').val();
    const maskFilter = maskFilterRaw === '' ? null : parseInt(maskFilterRaw, 10);

    for (let mapKey in dict) {
        if (mapKey.startsWith('_')) { continue; }

        // If a mask filter is set, ignore subnets that are more specific
        // (larger prefix length) than the selected mask when calculating
        // depth. Those rows will be hidden anyway.
        if (maskFilter !== null) {
            const parts = mapKey.split('/');
            if (parts.length === 2) {
                const size = parseInt(parts[1], 10);
                if (!Number.isNaN(size) && size > maskFilter) {
                    continue;
                }
            }
        }

        let newDepth = get_dict_max_depth(dict[mapKey], curDepth + 1)
        if (newDepth > maxDepth) { maxDepth = newDepth }
    }
    return maxDepth
}

function collect_mask_sizes(dict, sizes) {
    for (let mapKey in dict) {
        if (mapKey.startsWith('_')) { continue; }
        let parts = mapKey.split('/');
        if (parts.length === 2) {
            let size = parseInt(parts[1]);
            if (!Number.isNaN(size)) {
                sizes.add(size);
            }
        }
        if (has_network_sub_keys(dict[mapKey])) {
            collect_mask_sizes(dict[mapKey], sizes);
        }
    }
}



function get_join_children(subnetTree, childCount) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            childCount += get_join_children(subnetTree[mapKey])
        } else {
            return childCount
        }
    }
}

function has_network_sub_keys(dict) {
    let allKeys = Object.keys(dict)
    // Maybe an efficient way to do this with a Lambda?
    for (let i in allKeys) {
        if (!allKeys[i].startsWith('_') && allKeys[i] !== 'n' && allKeys[i] !== 'c' && allKeys[i] !== 'g' && allKeys[i] !== 'x') {
            return true
        }
    }
    return false
}

function count_network_children(network, subnetTree, ancestryList) {
    // TODO: This might be able to be optimized. Ultimately it needs to count the number of keys underneath
    // the current key that are rendered as rows in the table. Collapsed networks are treated as a single row.
    let childCount = 0
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        const node = subnetTree[mapKey];
        const isCollapsed = !!node['_collapsed'];

        if (has_network_sub_keys(node) && !isCollapsed) {
            childCount += count_network_children(network, node, ancestryList.concat([mapKey]))
        } else {
            if (ancestryList.includes(network)) {
                childCount += 1
            }
        }
    }
    return childCount
}

function get_network_children(network, subnetTree) {
    // TODO: This might be able to be optimized. Ultimately it needs to count the number of keys underneath
    // the current key are unsplit networks (IE rows in the table, IE keys with a value of {}).
    let subnetList = []
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        const node = subnetTree[mapKey];
        const isCollapsed = !!node['_collapsed'];
        if (has_network_sub_keys(node) && !isCollapsed) {
            subnetList.push.apply(subnetList, get_network_children(network, node))
        } else {
            subnetList.push(mapKey)
        }
    }
    return subnetList
}

function get_subnet_property(network, property, subnetTree) {
    if (subnetTree === undefined || subnetTree === null || subnetTree === '') {
        subnetTree = subnetMap;
    }

    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (mapKey === network) {
            return subnetTree[mapKey][property] || '';
        }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            const result = get_subnet_property(network, property, subnetTree[mapKey]);
            if (result !== undefined) {
                return result;
            }
        }
    }
}

function get_matching_network_list(network, subnetTree) {
    let subnetList = []
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            subnetList.push.apply(subnetList, get_matching_network_list(network, subnetTree[mapKey]))
        }
        if (mapKey.split('/')[0] === network) {
            subnetList.push(mapKey)
        }
    }
    return subnetList
}

function get_consolidated_property(subnetTree, property) {
    let allValues = get_property_values(subnetTree, property)
    // https://stackoverflow.com/questions/14832603/check-if-all-values-of-array-are-equal
    let allValuesMatch = allValues.every( (val, i, arr) => val === arr[0] )
    if (allValuesMatch) {
        return allValues[0]
    } else {
        return ''
    }
}

function get_property_values(subnetTree, property) {
    let propValues = []
    for (let mapKey in subnetTree) {
        if (has_network_sub_keys(subnetTree[mapKey])) {
            propValues.push.apply(propValues, get_property_values(subnetTree[mapKey], property))
        } else {
            // The "else" above is a bit different because it will start tracking values for subnets which are
            // in the hierarchy, but not displayed. Those are always blank so it messes up the value list
            propValues.push(subnetTree[mapKey][property] || '')
        }
    }
    return propValues
}

function get_network(networkInput, netSize) {
    let ipInt = ip2int(networkInput)
    netSize = parseInt(netSize)
    for (let i=31-netSize; i>=0; i--) {
        ipInt &= ~ 1<<i;
    }
    return int2ip(ipInt);
}

function split_network(networkInput, netSize) {
    let subnets = [networkInput + '/' + (netSize + 1)]
    let newSubnet = ip2int(networkInput) + 2**(32-netSize-1);
    subnets.push(int2ip(newSubnet) + '/' + (netSize + 1))
    return subnets;
}

function mutate_subnet_map(verb, network, subnetTree, propValue = '') {
    if (subnetTree === '') { subnetTree = subnetMap }
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) { continue; }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            mutate_subnet_map(verb, network, subnetTree[mapKey], propValue)
        }
        if (mapKey === network) {
            let netSplit = mapKey.split('/')
            let netSize = parseInt(netSplit[1])
            if (verb === 'split') {
                if (netSize < minSubnetSizes[operatingMode]) {
                    let new_networks = split_network(netSplit[0], netSize)
                    // Could maybe optimize this for readability with some null coalescing
                    subnetTree[mapKey][new_networks[0]] = {}
                    subnetTree[mapKey][new_networks[1]] = {}
                    // Copy note / color / group to children but KEEP it on the parent so all hierarchy levels can be labeled.
                    if (subnetTree[mapKey].hasOwnProperty('_note')) {
                        subnetTree[mapKey][new_networks[0]]['_note'] = subnetTree[mapKey]['_note']
                        subnetTree[mapKey][new_networks[1]]['_note'] = subnetTree[mapKey]['_note']
                    }
                    if (subnetTree[mapKey].hasOwnProperty('_color')) {
                        subnetTree[mapKey][new_networks[0]]['_color'] = subnetTree[mapKey]['_color']
                        subnetTree[mapKey][new_networks[1]]['_color'] = subnetTree[mapKey]['_color']
                    }
                } else {
                    switch (operatingMode) {
                        case 'AWS':
                            var modal_error_message = 'The minimum IPv4 subnet size for AWS is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer">Amazon Virtual Private Cloud > User Guide > Subnet CIDR Blocks > Subnet Sizing for IPv4</a>'
                            break;
                        case 'AZURE':
                            var modal_error_message = 'The minimum IPv4 subnet size for Azure is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#how-small-and-how-large-can-virtual-networks-and-subnets-be" target="_blank" rel="noopener noreferrer">Azure Virtual Network FAQ > How small and how large can virtual networks and subnets be?</a>'
                            break;
                        case 'OCI':
                            var modal_error_message = 'The minimum IPv4 subnet size for OCI is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer">Infrastructure Services>Networking>Networking Overview>Three IP Addresses in Each Subnet</a>'
                            break;
                        default:
                            var modal_error_message = 'The minimum size for an IPv4 subnet is /' + minSubnetSizes[operatingMode] + '.<br/><br/>More Information:<br/><a href="https://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing" target="_blank" rel="noopener noreferrer">Wikipedia - Classless Inter-Domain Routing</a>'
                            break;
                    }
                    show_warning_modal('<div>' + modal_error_message + '</div>')
                }
            } else if (verb === 'join') {
                // Options:
                //   [ Selected ] Keep note if all the notes are the same, blank them out if they differ. Most intuitive
                //   [ Possible ] Lose note data for all deleted subnets.
                //   [ Possible ] Keep note from first subnet in the join scope. Reasonable but I think rarely will the note be kept by the user
                //   [ Possible ] Concatenate all notes. Ugly and won't really be useful for more than two subnets being joined
                const consolidatedNote = get_consolidated_property(subnetTree[mapKey], '_note');
                const consolidatedColor = get_consolidated_property(subnetTree[mapKey], '_color');
                const consolidatedGroup = get_consolidated_property(subnetTree[mapKey], '_group');
                
                const parentNote = subnetTree[mapKey]['_note'];
                const parentColor = subnetTree[mapKey]['_color'];
                const parentGroup = subnetTree[mapKey]['_group'];

                subnetTree[mapKey] = {};
                if (consolidatedNote !== '') {
                    subnetTree[mapKey]['_note'] = consolidatedNote;
                } else if (parentNote) {
                    subnetTree[mapKey]['_note'] = parentNote;
                }

                if (consolidatedColor !== '') {
                    subnetTree[mapKey]['_color'] = consolidatedColor;
                } else if (parentColor) {
                    subnetTree[mapKey]['_color'] = parentColor;
                }

                if (consolidatedGroup !== '') {
                    subnetTree[mapKey]['_group'] = consolidatedGroup;
                } else if (parentGroup) {
                    subnetTree[mapKey]['_group'] = parentGroup;
                }
            } else if (verb === 'note') {
                subnetTree[mapKey]['_note'] = propValue
            } else if (verb === 'color') {
                subnetTree[mapKey]['_color'] = propValue
            } else if (verb === 'group') {
                subnetTree[mapKey]['_group'] = propValue
            } else if (verb === 'collapse') {
                subnetTree[mapKey]['_collapsed'] = !subnetTree[mapKey]['_collapsed']
            } else {
                // How did you get here?
            }
        }
    }
}

function switchMode(operatingMode) {

    let isSwitched = true;

    if (subnetMap !== null) {
        if (validateSubnetSizes(subnetMap, minSubnetSizes[operatingMode])) {

            renderTable(operatingMode);
            set_usable_ips_title(operatingMode);

            $('#netsize').attr('pattern', netsizePatterns[operatingMode]);
            $('#input_form').removeClass('was-validated');
            $('#input_form').rules('remove', 'netsize');

            switch (operatingMode) {
                case 'AWS':
                    var validate_error_message = 'AWS Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                case 'AZURE':
                    var validate_error_message = 'Azure Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                case 'OCI':
                    var validate_error_message = 'OCI Mode - Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
                default:
                    var validate_error_message = 'Smallest size is /' + minSubnetSizes[operatingMode]
                    break;
            }


            // Modify jquery validation rule
            $('#input_form #netsize').rules('add', {
                required: true,
                pattern: netsizePatterns[operatingMode],
                messages: {
                    required: 'Please enter a network size',
                    pattern: validate_error_message
                }
            });
            // Remove active class from all buttons if needed
            $('#dropdown_standard, #dropdown_azure, #dropdown_aws, #dropdown_oci').removeClass('active');
            $('#dropdown_' + operatingMode.toLowerCase()).addClass('active');
            isSwitched = true;
        } else {
            switch (operatingMode) {
                case 'AWS':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for AWS.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer">Amazon Virtual Private Cloud > User Guide > Subnet CIDR Blocks > Subnet Sizing for IPv4</a>'
                    break;
                case 'AZURE':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for Azure.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#how-small-and-how-large-can-virtual-networks-and-subnets-be" target="_blank" rel="noopener noreferrer">Azure Virtual Network FAQ > How small and how large can virtual networks and subnets be?</a>'
                    break;
                case 'OCI':
                    var modal_error_message = 'One or more subnets are smaller than the minimum allowed for OCI.<br/>The smallest size allowed is /' + minSubnetSizes[operatingMode] + '.<br/>See: <a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer">Infrastructure Services>Networking>Networking Overview>Three IP Addresses in Each Subnet</a>'
                    break;
                default:
                    var validate_error_message = 'Unknown Error'
                    break;
            }
            show_warning_modal('<div>' + modal_error_message + '</div>');
            isSwitched = false;
        }
    } else {
        //unlikely to get here.
        reset();
    }

    return isSwitched;


}

function validateSubnetSizes(subnetMap, minSubnetSize) {
    let isValid = true;
    const validate = (subnetTree) => {
        for (let key in subnetTree) {
            if (key.startsWith('_')) continue; // Skip special keys
            let [_, size] = key.split('/');
            if (parseInt(size) > minSubnetSize) {
                isValid = false;
                return; // Early exit if any subnet is invalid
            }
            if (typeof subnetTree[key] === 'object') {
                validate(subnetTree[key]); // Recursively validate subnets
            }
        }
    };
    validate(subnetMap);
    return isValid;
}


function set_usable_ips_title(operatingMode) {
    switch (operatingMode) {
        case 'AWS':
            $('#useableHeader').html('Usable IPs (<a href="https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html#subnet-sizing-ipv4" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="AWS reserves 5 addresses in each subnet for platform use.<br/>Click to navigate to the AWS documentation.">AWS</a>)')
            break;
        case 'AZURE':
            $('#useableHeader').html('Usable IPs (<a href="https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="Azure reserves 5 addresses in each subnet for platform use.<br/>Click to navigate to the Azure documentation.">Azure</a>)')
            break;
        case 'OCI':
            $('#useableHeader').html('Usable IPs (<a href="https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet" target="_blank" rel="noopener noreferrer" style="color:#000; border-bottom: 1px dotted #000; text-decoration: dotted" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-html="true" title="OCI reserves 3 addresses in each subnet for platform use.<br/>Click to navigate to the OCI documentation.">OCI</a>)')
            break;
        default:
            $('#useableHeader').html('Usable IPs')
            break;
    }
    $('[data-bs-toggle="tooltip"]').tooltip()
}

function show_warning_modal(message) {
    var notifyModal = new bootstrap.Modal(document.getElementById('notifyModal'), {});
    $('#notifyModal .modal-body').html(message)
    notifyModal.show()
}

$( document ).ready(function() {

    // Initialize the jQuery Validation on the form
    var validator = $('#input_form').validate({
        onfocusout: function (element) {
            $(element).valid();
        },
        rules: {
            network: {
                required: true,
                pattern: '^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
            },
            netsize: {
                required: true,
                pattern: '^([0-9]|[12][0-9]|3[0-2])$'
            }
        },
        messages: {
            network: {
                required: 'Please enter a network',
                pattern: 'Must be a valid IPv4 Address'
            },
            netsize: {
                required: 'Please enter a network size',
                pattern: 'Smallest size is /32'
            }
        },
        errorPlacement: function(error, element) {
            //console.log(error);
            //console.log(element);
            if (error[0].innerHTML !== '') {
                //console.log('Error Placement - Text')
                if (!element.data('errorIsVisible')) {
                    bootstrap.Tooltip.getInstance(element).setContent({'.tooltip-inner': error[0].innerHTML})
                    element.tooltip('show');
                    element.data('errorIsVisible', true)
                }
            } else {
                //console.log('Error Placement - Empty')
                //console.log(element);
                if (element.data('errorIsVisible')) {
                    element.tooltip('hide');
                    element.data('errorIsVisible', false)
                }

            }
            //console.log(element);
        },
        // This success function appears to be required as errorPlacement() does not fire without the success function
        // being defined.
        success: function(label, element) { },
        // When the form is valid, add the 'was-validated' class
        submitHandler: function(form) {
            form.classList.add('was-validated');
            form.submit(); // Submit the form
        }
    });

    let autoConfigResult = processConfigUrl();
    if (!autoConfigResult) {
        reset();
    }
});

function exportConfig(isMinified = true) {
    const baseNetwork = Object.keys(subnetMap)[0]
    let miniSubnetMap = {};
    subnetMap = sortIPCIDRs(subnetMap)
    if (isMinified) {
        minifySubnetMap(miniSubnetMap, subnetMap, baseNetwork)
    }
    if (operatingMode !== 'Standard') {
        return {
            'config_version': configVersion,
            'operating_mode': operatingMode,
            'base_network': baseNetwork,
            'subnets': isMinified ? miniSubnetMap : subnetMap,
        }
    } else {
        return {
            'config_version': configVersion,
            'base_network': baseNetwork,
            'subnets': isMinified ? miniSubnetMap : subnetMap,
        }
    }
}

function getConfigUrl() {
    // Deep Copy
    let defaultExport = JSON.parse(JSON.stringify(exportConfig(true)));
    renameKey(defaultExport, 'config_version', 'v')
    renameKey(defaultExport, 'base_network', 'b')
    if (defaultExport.hasOwnProperty('operating_mode')) {
        renameKey(defaultExport, 'operating_mode', 'm')
    }
    renameKey(defaultExport, 'subnets', 's')
    //console.log(JSON.stringify(defaultExport))
    return '/index.html?c=' + urlVersion + LZString.compressToEncodedURIComponent(JSON.stringify(defaultExport))
}

function processConfigUrl() {
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });
    if (params['c'] !== null) {
        // First character is the version of the URL string, in case the mechanism of encoding changes
        let urlVersion = params['c'].substring(0, 1)
        let urlData = params['c'].substring(1)
        let urlConfig = JSON.parse(LZString.decompressFromEncodedURIComponent(params['c'].substring(1)))
        renameKey(urlConfig, 'v', 'config_version')
        if (urlConfig.hasOwnProperty('m')) {
            renameKey(urlConfig, 'm', 'operating_mode')
        }
        renameKey(urlConfig, 's', 'subnets')
        if (urlConfig['config_version'] === '1') {
            // Version 1 Configs used full subnet strings as keys and just shortned the _note->_n and _color->_c keys
            expandKeys(urlConfig['subnets'])
        } else if (urlConfig['config_version'] === '2') {
            // Version 2 Configs uses the Nth Position representation for subnet keys and requires the base_network
            // option. It also uses n/c for note/color
            if (urlConfig.hasOwnProperty('b')) {
                renameKey(urlConfig, 'b', 'base_network')
            }
            let expandedSubnetMap = {};
            expandSubnetMap(expandedSubnetMap, urlConfig['subnets'], urlConfig['base_network'])
            urlConfig['subnets'] = expandedSubnetMap
        }
        importConfig(urlConfig)
        return true
    }
}

function minifySubnetMap(minifiedMap, referenceMap, baseNetwork) {
    for (let subnet in referenceMap) {
        if (subnet.startsWith('_')) continue;

        const nthRepresentation = getNthSubnet(baseNetwork, subnet);
        minifiedMap[nthRepresentation] = {}
        if (referenceMap[subnet].hasOwnProperty('_note')) {
            minifiedMap[nthRepresentation]['n'] = referenceMap[subnet]['_note']
        }
        if (referenceMap[subnet].hasOwnProperty('_color')) {
            minifiedMap[nthRepresentation]['c'] = referenceMap[subnet]['_color']
        }
        if (referenceMap[subnet].hasOwnProperty('_group')) {
            minifiedMap[nthRepresentation]['g'] = referenceMap[subnet]['_group']
        }
        if (referenceMap[subnet].hasOwnProperty('_collapsed')) {
            minifiedMap[nthRepresentation]['x'] = referenceMap[subnet]['_collapsed'] ? 1 : 0
        }
        if (Object.keys(referenceMap[subnet]).some(key => !key.startsWith('_'))) {
            minifySubnetMap(minifiedMap[nthRepresentation], referenceMap[subnet], baseNetwork);
        }
    }
}

function expandSubnetMap(expandedMap, miniMap, baseNetwork) {
    for (let mapKey in miniMap) {
        if (mapKey === 'n' || mapKey === 'c' || mapKey === 'g' || mapKey === 'x') {
            continue;
        }
        let subnetKey = getSubnetFromNth(baseNetwork, mapKey)
        expandedMap[subnetKey] = {}
        if (has_network_sub_keys(miniMap[mapKey])) {
            expandSubnetMap(expandedMap[subnetKey], miniMap[mapKey], baseNetwork)
        } else {
            if (miniMap[mapKey].hasOwnProperty('n')) {
                expandedMap[subnetKey]['_note'] = miniMap[mapKey]['n']
            }
            if (miniMap[mapKey].hasOwnProperty('c')) {
                expandedMap[subnetKey]['_color'] = miniMap[mapKey]['c']
            }
            if (miniMap[mapKey].hasOwnProperty('g')) {
                expandedMap[subnetKey]['_group'] = miniMap[mapKey]['g']
            }
            if (miniMap[mapKey].hasOwnProperty('x')) {
                expandedMap[subnetKey]['_collapsed'] = !!miniMap[mapKey]['x']
            }
        }
    }
}

// For Config Version 1 Backwards Compatibility
function expandKeys(subnetTree) {
    for (let mapKey in subnetTree) {
        if (mapKey.startsWith('_')) {
            continue;
        }
        if (has_network_sub_keys(subnetTree[mapKey])) {
            expandKeys(subnetTree[mapKey])
        } else {
            if (subnetTree[mapKey].hasOwnProperty('_n')) {
                renameKey(subnetTree[mapKey], '_n', '_note')
            }
            if (subnetTree[mapKey].hasOwnProperty('_c')) {
                renameKey(subnetTree[mapKey], '_c', '_color')
            }

        }
    }
}

function renameKey(obj, oldKey, newKey) {
    if (oldKey !== newKey) {
    Object.defineProperty(obj, newKey,
        Object.getOwnPropertyDescriptor(obj, oldKey));
        delete obj[oldKey];
    }
}

function importConfig(text) {
    if (text['config_version'] === '1') {
        var [subnetNet, subnetSize] = Object.keys(text['subnets'])[0].split('/')
    } else if (text['config_version'] === '2') {
        var [subnetNet, subnetSize] = text['base_network'].split('/')
    }
    $('#network').val(subnetNet)
    $('#netsize').val(subnetSize)
    maxNetSize = subnetSize
    subnetMap = sortIPCIDRs(text['subnets']);
    operatingMode = text['operating_mode'] || 'Standard'
    switchMode(operatingMode);

}

function sortIPCIDRs(obj) {
  // Base case: if the value is an empty object, return it
  if (typeof obj === 'object' && Object.keys(obj).length === 0) {
    return {};
  }

  // Separate CIDR entries from metadata
  const entries = Object.entries(obj);
  const cidrEntries = entries.filter(([key]) => !key.startsWith('_'));
  const metadataEntries = entries.filter(([key]) => key.startsWith('_'));

  // Sort CIDR entries by IP address
  const sortedCIDREntries = cidrEntries.sort((a, b) => {
    const ipA = a[0].split('/')[0].split('.').map(Number);
    const ipB = b[0].split('/')[0].split('.').map(Number);

    for (let i = 0; i < 4; i++) {
      if (ipA[i] !== ipB[i]) {
        return ipA[i] - ipB[i];
      }
    }
    return 0;
  });

  // Create sorted object, starting with metadata
  const sortedObj = {};

  // Add sorted CIDR entries with recursion
  for (const [key, value] of sortedCIDREntries) {
    sortedObj[key] = typeof value === 'object' ? sortIPCIDRs(value) : value;
  }

  // Add metadata entries (unsorted, as they appeared in original)
  for (const [key, value] of metadataEntries) {
    sortedObj[key] = value;
  }

  return sortedObj;
}

const rgba2hex = (rgba) => `#${rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/).slice(1).map((n, i) => (i === 3 ? Math.round(parseFloat(n) * 255) : parseFloat(n)).toString(16).padStart(2, '0').replace('NaN', '')).join('')}`
