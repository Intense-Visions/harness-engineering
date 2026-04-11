# Forensics Fundamentals

> Digital forensics is the discipline of collecting, preserving, and analyzing evidence from
> compromised systems -- done correctly, it reveals the full attack narrative; done poorly, it
> destroys the evidence needed to understand what happened and prevent recurrence

## When to Use

- A security incident has occurred and evidence must be collected from compromised systems
- Building forensic readiness capabilities before an incident occurs
- Analyzing logs across multiple systems to reconstruct an attack timeline
- Determining the scope of a breach -- what the attacker accessed, modified, or exfiltrated
- Collecting evidence that may be needed for legal proceedings or regulatory reporting
- Evaluating indicators of compromise (IOCs) shared by threat intelligence sources

## Threat Context

Forensic capability determines whether an organization can answer the four critical
questions after a breach: How did the attacker get in? What did they access? Are they still
in the environment? How do we prevent this from happening again? Without forensic evidence,
these questions remain unanswered:

- **Sony Pictures (2014)**: The attackers (attributed to North Korea) wiped hard drives and
  deleted logs to cover their tracks. Forensic investigators had to reconstruct the attack
  from network device logs, email server backups, and fragments recovered from partially
  wiped drives. The investigation took months because primary evidence had been destroyed.
  Organizations with centralized, immutable logging would have preserved critical evidence
  regardless of the attacker's wiper activity.
- **SolarWinds SUNBURST (2020)**: Forensic analysis of the SUNBURST backdoor required
  reverse engineering the malware, correlating DNS logs (the backdoor used DNS for C2
  beaconing), analyzing Active Directory logs for lateral movement, and examining email
  server access logs. The forensic complexity was extreme because the malware was
  specifically designed to evade detection -- it delayed execution for 12-14 days, checked
  for analysis tools, and mimicked legitimate Orion API traffic.
- **Capital One (2019)**: Forensic investigation revealed that a misconfigured WAF allowed
  the attacker to execute server-side request forgery (SSRF) against the EC2 metadata
  service, obtaining IAM role credentials. CloudTrail logs showed the attacker using those
  credentials to list and download S3 buckets containing 106 million customer records. The
  forensic trail was clear because AWS CloudTrail was enabled -- without it, the scope of
  the breach would have been unknown.
- **Norsk Hydro (2019)**: LockerGoga ransomware encrypted systems across 40 countries.
  Forensic analysis of the unencrypted backup systems and network logs revealed the initial
  access vector (a phishing email three months earlier), the lateral movement path (through
  Active Directory), and the attacker's dwell time. This forensic reconstruction informed
  the rebuild strategy and identified security gaps.

## Instructions

1. **Understand evidence types and the order of volatility.** Evidence exists on a spectrum
   from highly volatile (lost in seconds) to persistent (survives power loss). Collect the
   most volatile evidence first:
   - **CPU registers and cache** (nanoseconds): Practically uncollectable in post-incident
     forensics. Relevant only in live debugging or hardware-level analysis.
   - **Memory (RAM)** (lost on power off): Contains running processes, network connections,
     decrypted data, encryption keys, injected code, and attacker tools that never touch disk.
     Capture with LiME (Linux Memory Extractor), WinPMEM (Windows), or cloud-native memory
     acquisition (AWS EC2 memory dump via hibernation, Azure VM memory capture).
   - **Network state** (changes continuously): Active connections (`netstat`/`ss`), routing
     tables, ARP cache, DNS cache. Capture before any network isolation actions.
   - **Running processes** (changes continuously): Process list with full command lines, open
     file handles, loaded libraries, network sockets per process. On Linux: `/proc` filesystem
     provides rich per-process data. Capture before any containment actions.
   - **Disk** (persists across power cycles): File system contents, deleted files (recoverable
     until overwritten), file timestamps (created, modified, accessed), swap space, page files,
     hibernation files. Image with `dd`, `dc3dd`, or FTK Imager. Use write-blockers to prevent
     modification during imaging.
   - **Logs** (persists but may rotate): Application logs, system logs, authentication logs,
     firewall logs, proxy logs, DNS query logs. Export and hash immediately. Remote/centralized
     logs are more trustworthy than local logs on the compromised system.
   - **Configuration** (persists): System configuration, application configuration, cron jobs,
     scheduled tasks, startup scripts, user accounts. Compare against known-good baselines to
     identify attacker modifications.

2. **Collect evidence without modifying it.** The forensic principle of non-contamination
   requires that evidence collection does not alter the evidence:
   - **Disk imaging**: Use a hardware write-blocker between the source disk and the forensic
     workstation. This physically prevents writes to the source. Create a bit-for-bit image
     using `dd if=/dev/sda of=/evidence/image.raw bs=4k conv=noerror,sync` or `dc3dd` (which
     adds hashing during imaging). Compute SHA-256 hashes of both the source and the image to
     verify integrity.
   - **Memory acquisition**: Memory acquisition tools (LiME, WinPMEM) necessarily modify a
     small amount of memory when they load. This is accepted and documented. Run the tool from
     external media (USB drive) to minimize footprint on the target system.
   - **Log collection**: Copy logs to a separate system; do not analyze on the compromised
     host. Hash each log file after export. If the attacker had root access, local logs may
     have been tampered with -- cross-reference with centralized logging infrastructure.
   - **Cloud environments**: Use cloud provider APIs for evidence collection. AWS: create EBS
     snapshots, export CloudTrail logs, capture VPC Flow Logs. Azure: create disk snapshots,
     export Activity Logs, capture NSG Flow Logs. GCP: create disk snapshots, export Cloud
     Audit Logs, capture VPC Flow Logs. These API-based methods are non-destructive.

3. **Maintain chain of custody.** For evidence to be admissible in legal proceedings and
   credible in regulatory investigations, every transfer of evidence must be documented:
   - Record who collected the evidence, when (timestamp), from what system (hostname, IP,
     serial number), using what tool and method.
   - Record every person who accessed the evidence, when, and for what purpose.
   - Store evidence on encrypted, access-controlled media with tamper-evident seals for
     physical storage.
   - Compute and record cryptographic hashes (SHA-256) at collection time and verify them
     before every analysis session.
   - Use a chain of custody form (physical or digital) with fields for: evidence ID,
     description, date/time collected, collected by, hash value, storage location, and a
     transfer log (date, from, to, purpose).

4. **Reconstruct the attack timeline.** The timeline is the primary forensic deliverable --
   a chronological narrative of the attacker's actions:
   - **Normalize timestamps**: Convert all log sources to UTC. Clock skew between systems
     causes events to appear out of order. Verify NTP configuration on all systems and note
     any clock drift observed during collection.
   - **Correlate across sources**: An authentication log shows a login at 14:32 UTC. The web
     server log shows the same user accessing /admin at 14:33. The database audit log shows a
     bulk export at 14:35. The firewall log shows an outbound connection to an external IP at
     14:37. Each source provides a partial view; correlation reveals the full narrative.
   - **Identify key events**: Initial compromise (how the attacker got in), persistence
     establishment (how they ensured continued access), privilege escalation (how they gained
     higher privileges), lateral movement (how they moved to other systems), data access (what
     they viewed or copied), data exfiltration (how they removed data from the environment).
   - **Fill gaps**: Missing evidence does not mean nothing happened. If the attacker had
     access to a system with no logging, assume the worst case for scope assessment and note
     the evidence gap in the timeline.

5. **Identify and document indicators of compromise (IOCs).** IOCs are observable artifacts
   that indicate a system has been compromised:
   - **Network IOCs**: IP addresses, domain names, URLs used for command-and-control, data
     exfiltration, or malware delivery. Include port numbers and protocols.
   - **Host IOCs**: File hashes (MD5, SHA-1, SHA-256) of malware, backdoors, or attacker
     tools. File paths where malware was installed. Registry keys modified (Windows). Cron
     jobs or systemd units added (Linux). User accounts created by the attacker.
   - **Behavioral IOCs**: Unusual process execution patterns, anomalous network traffic
     volumes, off-hours access, access to sensitive resources by accounts that do not normally
     access them.
   - **Share IOCs**: Use STIX (Structured Threat Information Expression) format for machine-
     readable IOC sharing. Share with ISACs (Information Sharing and Analysis Centers), peer
     organizations, and threat intelligence platforms via TAXII (Trusted Automated Exchange of
     Intelligence Information) feeds. Sharing IOCs helps other organizations detect the same
     attacker.

## Details

- **Memory forensics -- what lives only in RAM**: Memory contains information that never
  touches disk and is lost forever on power off: in-progress network connections and their
  contents (pre-encryption for TLS sessions), decrypted versions of encrypted data,
  encryption keys for full-disk encryption (BitLocker, LUKS) that could unlock the disk
  image, injected code that was loaded directly into process memory without writing to disk
  (fileless malware), clipboard contents, command history in running shells, and credentials
  cached by the operating system (LSASS on Windows, which stores NTLM hashes, Kerberos
  tickets, and plaintext passwords in some configurations). Tools like Volatility Framework
  analyze memory dumps to extract this information.

- **Log analysis patterns for common attack types**: Brute force: many failed logins followed
  by a success from the same source. Credential stuffing: failed logins across many accounts
  from a distributed set of IPs. Privilege escalation: a normal user account suddenly
  accesses admin endpoints. Data exfiltration: unusually large responses to API calls, bulk
  download patterns, or connections to unfamiliar external IP addresses. Lateral movement:
  a compromised server making authentication requests to other internal servers using
  credentials it should not possess. Web shell: a web server process spawning command-line
  processes (e.g., Apache httpd spawning `/bin/sh`).

- **Cloud forensics differences**: In cloud environments, you typically cannot access the
  physical hardware or hypervisor layer. Evidence collection relies on provider APIs.
  Advantages: disk snapshots are instantaneous and non-destructive, cloud audit logs
  (CloudTrail, Activity Log, Cloud Audit Logs) cannot be deleted by the attacker if properly
  configured (send to a separate account/project with restricted access). Challenges: memory
  acquisition may not be possible for all instance types, network captures require prior VPC
  Flow Log enablement, ephemeral instances (serverless, containers) may leave minimal
  forensic artifacts.

## Anti-Patterns

1. **Modifying evidence during collection.** Running analysis tools on the compromised system,
   which modifies file access timestamps, loads libraries into memory, and creates temporary
   files. Use a forensic workstation for analysis, not the compromised host. If live
   collection is necessary (memory dump), document the tool's footprint and accept the minimal
   contamination.

2. **Analyzing on the live compromised system.** Installing and running forensic tools
   directly on the compromised host. The attacker may have installed rootkits that hide
   processes, files, and network connections from the operating system. Analysis on the live
   system sees what the rootkit allows. Analysis of a disk image on a clean forensic
   workstation reveals the rootkit itself.

3. **Incomplete timeline with unexplained gaps.** Building a timeline that shows the initial
   compromise and the data exfiltration but skips the intermediate steps. The gaps likely
   contain lateral movement and persistence mechanisms. If the attacker established persistence
   that the timeline does not account for, remediation will be incomplete and the attacker
   will regain access.

4. **No chain of custody documentation.** Collecting evidence but not recording who collected
   it, when, and how it was stored and accessed. If the incident leads to legal action
   (lawsuit, criminal prosecution, regulatory enforcement), evidence without chain of custody
   may be inadmissible. Even for internal investigations, undocumented evidence handling
   undermines the credibility of the findings.

5. **Collecting only one type of evidence.** Gathering disk images but not memory. Exporting
   application logs but not network logs. Each evidence type reveals different aspects of the
   attack. Memory shows the attacker's active tools. Disk shows persistence mechanisms. Logs
   show the timeline. Network captures show data exfiltration. A comprehensive investigation
   requires multiple evidence types correlated together.
