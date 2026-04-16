#!/usr/bin/env python3
"""
Domain verification script for trucking/logistics companies.
Checks if Business_Domain values resolve to live websites.
Outputs CSV with verification results.
"""

import csv
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
import socket
import concurrent.futures
import ssl
import re
from datetime import datetime

INPUT_FILE = '/tmp/companies.tsv'
OUTPUT_FILE = '/tmp/verified_domains.csv'
MAX_WORKERS = 50
TIMEOUT = 10

PARKING_PATTERNS = [
    r'domain.? (is|for sale|parking|parked)',
    r'buy this domain',
    r'this domain is',
    r'godaddy\.com',
    r'namecheap\.com',
    r'sedo\.com',
    r'dan\.com',
    r'hugedomains',
    r'afternic',
    r'underconstruction',
    r'coming soon',
    r'under construction',
    r'404 not found',
    r'page not found',
    r'website coming soon',
    r'this site is under',
    r'squarespace\.com.*you are the visitor',
    r'wixsite\.com.*site is offline',
]
PARKING_RE = re.compile('|'.join(PARKING_PATTERNS), re.IGNORECASE)

def is_parked_or_placeholder(html: str) -> bool:
    if not html:
        return False
    return bool(PARKING_RE.search(html[:3000]))

def check_domain(domain: str):
    """Returns (status, final_url, notes)"""
    if not domain or domain.strip() == '':
        return 'NO_DOMAIN', '', 'No domain provided'

    domain = domain.strip().lower()
    if domain.startswith('http'):
        urls_to_try = [domain]
    else:
        urls_to_try = [f'https://{domain}', f'http://{domain}']

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for url in urls_to_try:
        try:
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (compatible; DomainChecker/1.0)',
                    'Accept': 'text/html,*/*'
                }
            )
            handler = urllib.request.HTTPSHandler(context=ctx)
            opener = urllib.request.build_opener(handler)

            response = opener.open(req, timeout=TIMEOUT)
            final_url = response.geturl()
            html = response.read(5000).decode('utf-8', errors='ignore')

            if is_parked_or_placeholder(html):
                return 'PARKED', final_url, 'Domain appears parked/for sale'

            return 'WORKING', final_url, f'HTTP {response.status}'

        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 405, 429):
                return 'WORKING', url, f'HTTP {e.code} (blocked but live)'
            elif e.code in (301, 302, 307, 308):
                return 'REDIRECT', url, f'HTTP {e.code}'
            else:
                continue
        except urllib.error.URLError as e:
            reason = str(e.reason) if hasattr(e, 'reason') else str(e)
            if 'Name or service not known' in reason or 'nodename nor servname' in reason:
                return 'DNS_FAIL', '', 'DNS resolution failed'
            if 'timed out' in reason.lower() or 'timeout' in reason.lower():
                continue  # try http next
            continue
        except socket.timeout:
            continue
        except Exception as e:
            continue

    return 'UNREACHABLE', '', 'Could not connect'

def process_batch(companies):
    results = []

    def verify_one(company):
        domain = company.get('Business_Domain', '').strip()
        status, final_url, notes = check_domain(domain)
        return {**company,
                'Verified_Status': status,
                'Final_URL': final_url,
                'Verification_Notes': notes,
                'Verified_At': datetime.now().isoformat()[:19]}

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(verify_one, c): c for c in companies}
        for i, future in enumerate(concurrent.futures.as_completed(futures)):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                company = futures[future]
                results.append({**company,
                                'Verified_Status': 'ERROR',
                                'Final_URL': '',
                                'Verification_Notes': str(e),
                                'Verified_At': datetime.now().isoformat()[:19]})

            if (i + 1) % 100 == 0:
                working = sum(1 for r in results if r.get('Verified_Status') == 'WORKING')
                print(f'  Progress: {i+1}/{len(companies)} checked, {working} working so far', flush=True)

    return results

def main():
    print(f'Loading companies from {INPUT_FILE}...', flush=True)
    companies = []
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            companies.append(row)

    print(f'Loaded {len(companies)} companies', flush=True)
    print(f'Starting verification with {MAX_WORKERS} concurrent workers...', flush=True)

    start = time.time()
    results = process_batch(companies)
    elapsed = time.time() - start

    # Write results
    if results:
        fieldnames = list(results[0].keys())
        with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)

    # Summary stats
    statuses = {}
    for r in results:
        s = r.get('Verified_Status', 'UNKNOWN')
        statuses[s] = statuses.get(s, 0) + 1

    print(f'\n=== VERIFICATION COMPLETE ===')
    print(f'Time elapsed: {elapsed:.0f}s')
    print(f'Total companies: {len(results)}')
    print(f'\nResults by status:')
    for status, count in sorted(statuses.items(), key=lambda x: -x[1]):
        pct = count / len(results) * 100
        print(f'  {status}: {count} ({pct:.1f}%)')
    print(f'\nOutput saved to: {OUTPUT_FILE}')

if __name__ == '__main__':
    main()
