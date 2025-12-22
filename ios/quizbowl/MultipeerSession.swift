import Foundation
import MultipeerConnectivity
import React

@objc(MultipeerSession)
class MultipeerSession: RCTEventEmitter, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
  private let serviceType = "qbowl-mc"
  private var peerID: MCPeerID?
  private var session: MCSession?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var browser: MCNearbyServiceBrowser?
  private var currentSessionId: String?

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  override func supportedEvents() -> [String]! {
    return ["MultipeerEvent"]
  }

  @objc(startHosting:withResolver:withRejecter:)
  func startHosting(sessionId: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    reset()
    currentSessionId = sessionId
    peerID = MCPeerID(displayName: UIDevice.current.name)
    guard let peerID = peerID else {
      reject("peer_init_failed", "Unable to create peer ID", nil)
      return
    }
    session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
    session?.delegate = self

    let info = ["sessionId": sessionId]
    advertiser = MCNearbyServiceAdvertiser(peer: peerID, discoveryInfo: info, serviceType: serviceType)
    advertiser?.delegate = self
    advertiser?.startAdvertisingPeer()

    // Host also browses to connect to new peers quickly.
    browser = MCNearbyServiceBrowser(peer: peerID, serviceType: serviceType)
    browser?.delegate = self
    browser?.startBrowsingForPeers()

    resolve(nil)
  }

  @objc(joinSession:withResolver:withRejecter:)
  func joinSession(sessionId: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    reset()
    currentSessionId = sessionId
    peerID = MCPeerID(displayName: UIDevice.current.name)
    guard let peerID = peerID else {
      reject("peer_init_failed", "Unable to create peer ID", nil)
      return
    }
    session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
    session?.delegate = self

    browser = MCNearbyServiceBrowser(peer: peerID, serviceType: serviceType)
    browser?.delegate = self
    browser?.startBrowsingForPeers()
    resolve(nil)
  }

  @objc(sendEvent:withResolver:withRejecter:)
  func sendEvent(_ eventJson: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let session = session, !session.connectedPeers.isEmpty else {
      resolve(nil)
      return
    }
    guard let data = eventJson.data(using: .utf8) else {
      reject("event_encoding_failed", "Unable to encode event", nil)
      return
    }
    do {
      try session.send(data, toPeers: session.connectedPeers, with: .reliable)
      resolve(nil)
    } catch {
      reject("event_send_failed", "Failed to send event", error)
    }
  }

  @objc(disconnect:withRejecter:)
  func disconnect(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    reset()
    resolve(nil)
  }

  private func reset() {
    advertiser?.stopAdvertisingPeer()
    browser?.stopBrowsingForPeers()
    session?.disconnect()
    advertiser = nil
    browser = nil
    session = nil
    peerID = nil
    currentSessionId = nil
  }

  // MARK: - MCNearbyServiceAdvertiserDelegate
  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
    // Accept only matching session IDs when provided.
    if let context = context, let info = try? JSONSerialization.jsonObject(with: context) as? [String: Any],
       let incomingId = info["sessionId"] as? String, let currentSessionId = currentSessionId {
      if incomingId != currentSessionId {
        invitationHandler(false, nil)
        return
      }
    }
    invitationHandler(true, session)
  }

  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    sendError(error)
  }

  // MARK: - MCNearbyServiceBrowserDelegate
  func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String : String]?) {
    if let expectedId = currentSessionId, let discovered = info?["sessionId"], expectedId != discovered {
      return
    }
    browser.invitePeer(peerID, to: session!, withContext: contextData(), timeout: 20)
  }

  func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    // no-op
  }

  func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    sendError(error)
  }

  private func contextData() -> Data? {
    guard let sessionId = currentSessionId else { return nil }
    return try? JSONSerialization.data(withJSONObject: ["sessionId": sessionId])
  }

  // MARK: - MCSessionDelegate
  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    // Could emit peer updates here if needed.
  }

  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    guard let string = String(data: data, encoding: .utf8) else { return }
    sendEvent(withName: "MultipeerEvent", body: ["event": string])
  }

  func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
  func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
  func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}

  func session(_ session: MCSession, didReceiveCertificate certificate: [Any]?, fromPeer peerID: MCPeerID, certificateHandler: @escaping (Bool) -> Void) {
    // Always accept for local play.
    certificateHandler(true)
  }

  private func sendError(_ error: Error) {
    sendEvent(withName: "MultipeerEvent", body: ["event": "{\"type\":\"error\",\"message\":\"\(error.localizedDescription)\"}"])
  }
}
