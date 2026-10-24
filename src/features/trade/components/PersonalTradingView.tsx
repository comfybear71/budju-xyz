import { motion, AnimatePresence } from "motion/react";
import { FaTimes, FaUserShield } from "react-icons/fa";
import PersonalExchangeKeyPanel from "./PersonalExchangeKeyPanel";
import CommunityHoldingsSummary from "./CommunityHoldingsSummary";
import PersonalActivityView from "./PersonalActivityView";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wallet: string;
  isAdmin?: boolean;
}

/** Full-page overlay for the non-custodial trading setup — connect your own
 *  Swyftx API key so the bot trades in your own account, never BUDJU's. */
const PersonalTradingView = ({ isOpen, onClose, wallet, isAdmin = false }: Props) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="absolute inset-x-0 bottom-0 top-14 mx-auto w-full max-w-[420px] md:max-w-xl bg-[#0a0a1a] rounded-t-2xl md:rounded-t-3xl overflow-y-auto pb-20"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                    style={{ background: "rgba(16,185,129,0.15)" }}
                  >
                    <FaUserShield size={14} className="text-emerald-400" />
                  </div>
                  <span className="text-base font-bold text-slate-200">My Exchange Key</span>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <FaTimes size={14} className="text-slate-400" />
                </button>
              </div>

              <PersonalExchangeKeyPanel wallet={wallet} />

              {wallet && (
                <div className="mt-6 pt-5 border-t border-white/[0.06]">
                  <PersonalActivityView wallet={wallet} isAdmin={isAdmin} />
                </div>
              )}

              {isAdmin && (
                <div className="mt-6 pt-5 border-t border-white/[0.06]">
                  <CommunityHoldingsSummary adminWallet={wallet} />
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PersonalTradingView;
