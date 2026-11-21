pub mod command_server;
pub mod remote_server;
pub mod phone_capture;

/// The address a phone or another computer on the station's network should use to reach this
/// one. `local_ip()` simply returns the first interface, which on a laptop with a VPN or Docker
/// can be an address nothing else can reach, so real local-network addresses are preferred:
/// 192.168.x.x first, then 10.x.x.x, then 172.16 to 172.31 (but not Docker's). Addresses from
/// a VPN (100.64.0.0/10), link-local ones and virtual interfaces are left for last resort.
pub fn lan_address() -> Option<std::net::IpAddr> {
    use std::net::{IpAddr, Ipv4Addr};
    fn rank(name: &str, ip: &Ipv4Addr) -> Option<u8> {
        let n = name.to_ascii_lowercase();
        let virtual_interface = ["docker", "br-", "veth", "virbr", "vmnet", "vboxnet", "tailscale", "tun", "tap", "zt", "utun", "wg"].iter().any(|p| n.starts_with(p));
        let o = ip.octets();
        if ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() || virtual_interface {
            return None;
        }
        match o {
            [192, 168, ..] => Some(0),
            [10, ..] => Some(1),
            [172, b, ..] if (16..=31).contains(&b) => Some(2),
            [100, b, ..] if (64..=127).contains(&b) => None,
            _ => Some(3),
        }
    }
    let best = local_ip_address::list_afinet_netifas()
        .ok()?
        .into_iter()
        .filter_map(|(name, ip)| match ip {
            IpAddr::V4(v4) => rank(&name, &v4).map(|r| (r, ip)),
            _ => None,
        })
        .min_by_key(|(r, _)| *r)
        .map(|(_, ip)| ip);
    best.or_else(|| local_ip_address::local_ip().ok())
}

#[cfg(test)]
mod lan_address_tests {
    #[test]
    fn it_finds_some_address_or_none_without_panicking() {
        let _ = super::lan_address();
    }
}
